// Cuenta del usuario, notificaciones, IA y administración de usuarios.
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { all, get, run } from '../db.js';
import { HttpError, validate, idParam, nombreSchema, passwordSchema, estado3dSchema } from '../lib/http.js';
import { requireAuth, requireRole, firmarToken } from '../lib/auth.js';
import { vistaUsuario, usuarioPorId, estadisticasUsuario } from '../lib/game.js';
import { chatTutor, tutorSinIA, clonar } from '../services/ai.js';
import { notificar } from '../services/notifications.js';

const router = Router();
router.use(requireAuth);

// ===================== MI CUENTA =====================
router.get('/me/estadisticas', async (req, res) => {
  res.json(await estadisticasUsuario(req.user.id));
});

const AVATAR_MAX = 350_000; // ~250 KB de imagen en base64
router.patch('/me', async (req, res) => {
  const d = validate(
    z.object({
      nombre: nombreSchema.optional(),
      tema: z.enum(['system', 'light', 'dark']).optional(),
      notifActivas: z.boolean().optional(),
      avatar: z
        .string()
        .max(AVATAR_MAX, 'La imagen es demasiado grande (máx. ~250 KB)')
        .regex(/^data:image\/(png|jpe?g|webp);base64,/, 'Formato de imagen no soportado')
        .nullable()
        .optional(),
    }),
    req.body
  );
  const sets = [];
  const args = [];
  if (d.nombre !== undefined) { sets.push('nombre = ?'); args.push(d.nombre); }
  if (d.tema !== undefined) { sets.push('tema = ?'); args.push(d.tema); }
  if (d.notifActivas !== undefined) { sets.push('notif_activas = ?'); args.push(d.notifActivas ? 1 : 0); }
  if (d.avatar !== undefined) { sets.push('avatar = ?'); args.push(d.avatar); }
  if (!sets.length) throw new HttpError(400, 'No hay cambios para guardar');
  await run(`UPDATE USUARIO SET ${sets.join(', ')} WHERE id_usuario = ?`, [...args, req.user.id]);
  res.json({ usuario: vistaUsuario(await usuarioPorId(req.user.id)) });
});

router.post('/me/password', async (req, res) => {
  const { actual, nueva } = validate(z.object({ actual: z.string().optional(), nueva: passwordSchema }), req.body);
  const u = await usuarioPorId(req.user.id);
  if (u.password_hash) {
    if (!actual) throw new HttpError(400, 'Ingresá tu contraseña actual', { actual: 'Ingresá tu contraseña actual' });
    if (!(await bcrypt.compare(actual, u.password_hash))) throw new HttpError(400, 'La contraseña actual es incorrecta', { actual: 'La contraseña actual es incorrecta' });
    if (actual === nueva) throw new HttpError(400, 'La nueva contraseña debe ser distinta', { nueva: 'Debe ser distinta a la actual' });
  }
  await run('UPDATE USUARIO SET password_hash = ?, token_version = token_version + 1 WHERE id_usuario = ?', [await bcrypt.hash(nueva, 10), req.user.id]);
  // Devolvemos un token nuevo: este dispositivo sigue logueado, los demás se cierran.
  const actualizado = await usuarioPorId(req.user.id);
  res.json({ token: firmarToken(actualizado), usuario: vistaUsuario(actualizado) });
});

router.delete('/me', async (req, res) => {
  const u = await usuarioPorId(req.user.id);
  if (u.rol === 'superadmin') {
    const { n } = await get("SELECT COUNT(*) AS n FROM USUARIO WHERE rol = 'superadmin'");
    if (Number(n) <= 1) throw new HttpError(400, 'Sos el único superadmin: asigná otro antes de borrar tu cuenta');
  }
  if (u.password_hash) {
    const { password } = validate(z.object({ password: z.string({ error: 'Confirmá con tu contraseña' }).min(1, 'Confirmá con tu contraseña') }), req.body);
    if (!(await bcrypt.compare(password, u.password_hash))) throw new HttpError(400, 'Contraseña incorrecta', { password: 'Contraseña incorrecta' });
  }
  await run('DELETE FROM USUARIO WHERE id_usuario = ?', [req.user.id]);
  res.json({ ok: true });
});

// ===================== NOTIFICACIONES =====================
router.get('/notificaciones', async (req, res) => {
  const rows = await all('SELECT * FROM NOTIFICACION WHERE id_usuario = ? ORDER BY id_notificacion DESC LIMIT 50', [req.user.id]);
  const { n } = await get('SELECT COUNT(*) AS n FROM NOTIFICACION WHERE id_usuario = ? AND leida = 0', [req.user.id]);
  res.json({
    noLeidas: Number(n),
    items: rows.map((r) => ({ id: Number(r.id_notificacion), titulo: r.titulo, cuerpo: r.cuerpo, tipo: r.tipo, data: r.data_json ? JSON.parse(r.data_json) : {}, leida: !!Number(r.leida), creadoEn: r.creado_en })),
  });
});

router.post('/notificaciones/leer', async (req, res) => {
  const { ids } = validate(z.object({ ids: z.array(z.number().int()).optional() }), req.body);
  if (ids?.length) await run(`UPDATE NOTIFICACION SET leida = 1 WHERE id_usuario = ? AND id_notificacion IN (${ids.map(() => '?').join(',')})`, [req.user.id, ...ids]);
  else await run('UPDATE NOTIFICACION SET leida = 1 WHERE id_usuario = ?', [req.user.id]);
  res.json({ ok: true });
});

router.delete('/notificaciones', async (req, res) => {
  await run('DELETE FROM NOTIFICACION WHERE id_usuario = ?', [req.user.id]);
  res.json({ ok: true });
});

// ===================== TUTOR IA =====================
const limiteIA = rateLimit({ windowMs: 60_000, limit: 20, keyGenerator: (req) => `ia-${req.user.id}`, message: { error: 'Estás enviando mensajes muy rápido. Esperá un minuto.' } });

router.post('/ia/chat', limiteIA, async (req, res) => {
  const d = validate(
    z.object({
      mensaje: z.string({ error: 'Escribí un mensaje' }).trim().min(1, 'Escribí un mensaje').max(600, 'Máximo 600 caracteres'),
      historial: z.array(z.object({ rol: z.enum(['usuario', 'ia']), texto: z.string().max(2000) })).max(30).optional().default([]),
      estado: estado3dSchema.optional(),
      idEjercicio: z.number().int().positive().nullish(),
    }),
    req.body
  );
  const ejercicio = d.idEjercicio ? await get('SELECT * FROM EJERCICIO WHERE id_ejercicio = ?', [d.idEjercicio]) : null;
  const estado = d.estado || { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] };
  try {
    res.json(await chatTutor({ usuario: req.user, mensaje: d.mensaje, historial: d.historial, estado, ejercicio }));
  } catch (e) {
    // Si Gemini falla (cuota, red, clave inválida) se usa el intérprete local.
    console.warn('[ia] Gemini falló, usando modo local:', e.message);
    const r = await tutorSinIA({ usuario: req.user, mensaje: d.mensaje, estadoSim: clonar(estado), acciones: [], ejercicio });
    res.json({ ...r, aviso: 'El tutor IA no está disponible ahora; respondí con el modo básico.' });
  }
});

// ===================== ADMINISTRACIÓN =====================
router.get('/admin/resumen', requireRole('superadmin'), async (_req, res) => {
  const q = async (sql) => Number((await get(sql)).n);
  res.json({
    usuarios: await q('SELECT COUNT(*) AS n FROM USUARIO'),
    superadmins: await q("SELECT COUNT(*) AS n FROM USUARIO WHERE rol = 'superadmin'"),
    autores: await q('SELECT COUNT(DISTINCT creado_por) AS n FROM EJERCICIO WHERE creado_por IS NOT NULL'),
    ejercicios: await q('SELECT COUNT(*) AS n FROM EJERCICIO'),
    completados: await q('SELECT COUNT(*) AS n FROM PROGRESO_USUARIO WHERE completado = 1'),
    comentarios: await q('SELECT COUNT(*) AS n FROM COMENTARIO'),
    saludos: await q('SELECT COUNT(*) AS n FROM SALUDO'),
  });
});

router.get('/admin/usuarios', requireRole('superadmin'), async (req, res) => {
  const q = req.query.q ? `%${req.query.q}%` : '%';
  const rows = await all('SELECT * FROM USUARIO WHERE nombre LIKE ? OR email LIKE ? ORDER BY creado_en DESC LIMIT 200', [q, q]);
  res.json(rows.map(vistaUsuario));
});

router.patch('/admin/usuarios/:id/rol', requireRole('superadmin'), async (req, res) => {
  const id = idParam(req.params.id);
  const { rol } = validate(z.object({ rol: z.enum(['usuario', 'superadmin'], { error: 'Rol inválido' }) }), req.body);
  if (id === req.user.id) throw new HttpError(400, 'No podés cambiar tu propio rol');
  const r = await run('UPDATE USUARIO SET rol = ? WHERE id_usuario = ?', [rol, id]);
  if (!r.changes) throw new HttpError(404, 'El usuario no existe');
  await notificar(id, '🔑 Tu rol cambió', rol === 'superadmin' ? 'Ahora sos superadmin: podés moderar contenido y usuarios.' : 'Tu cuenta volvió a ser de usuario.', 'rol', { rol });
  res.json({ usuario: vistaUsuario(await usuarioPorId(id)) });
});

router.delete('/admin/usuarios/:id', requireRole('superadmin'), async (req, res) => {
  const id = idParam(req.params.id);
  if (id === req.user.id) throw new HttpError(400, 'Para borrar tu cuenta usá la opción de tu perfil');
  const r = await run('DELETE FROM USUARIO WHERE id_usuario = ?', [id]);
  if (!r.changes) throw new HttpError(404, 'El usuario no existe');
  res.json({ ok: true });
});

export default router;

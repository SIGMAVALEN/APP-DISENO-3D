// ABM de Categorías y Ejercicios + validación de intentos + interacción
// entre usuarios (comentarios con respuestas y valoraciones).
import { Router } from 'express';
import { z } from 'zod';
import { all, get, run } from '../db.js';
import { HttpError, validate, idParam, estado3dSchema } from '../lib/http.js';
import { requireAuth, requireRole } from '../lib/auth.js';
import { validarIntento } from '../lib/game.js';
import { notificar, notificarVarios } from '../services/notifications.js';

const router = Router();
router.use(requireAuth);

const DOCENTES = ['profesor', 'admin'];

// ===================== CATEGORÍAS =====================
const categoriaSchema = z.object({
  nombre: z.string({ error: 'El nombre es obligatorio' }).trim().min(3, 'Mínimo 3 caracteres').max(40, 'Máximo 40 caracteres'),
  descripcion: z.string().trim().max(200, 'Máximo 200 caracteres').optional().default(''),
  icono: z.string().trim().max(40).optional().default('cube-outline'),
});

router.get('/categorias', async (_req, res) => {
  const rows = await all(
    `SELECT c.*, (SELECT COUNT(*) FROM EJERCICIO e WHERE e.id_categoria = c.id_categoria) AS total_ejercicios
       FROM CATEGORIA c ORDER BY c.id_categoria`
  );
  res.json(rows.map((c) => ({ id: Number(c.id_categoria), nombre: c.nombre, descripcion: c.descripcion, icono: c.icono, totalEjercicios: Number(c.total_ejercicios) })));
});

router.post('/categorias', requireRole(...DOCENTES), async (req, res) => {
  const d = validate(categoriaSchema, req.body);
  const { lastId } = await run('INSERT INTO CATEGORIA (nombre, descripcion, icono) VALUES (?,?,?)', [d.nombre, d.descripcion, d.icono]);
  res.status(201).json({ id: lastId, ...d });
});

router.put('/categorias/:id', requireRole(...DOCENTES), async (req, res) => {
  const id = idParam(req.params.id);
  const d = validate(categoriaSchema, req.body);
  const r = await run('UPDATE CATEGORIA SET nombre = ?, descripcion = ?, icono = ? WHERE id_categoria = ?', [d.nombre, d.descripcion, d.icono, id]);
  if (!r.changes) throw new HttpError(404, 'La categoría no existe');
  res.json({ id, ...d });
});

router.delete('/categorias/:id', requireRole('admin'), async (req, res) => {
  const id = idParam(req.params.id);
  const r = await run('DELETE FROM CATEGORIA WHERE id_categoria = ?', [id]);
  if (!r.changes) throw new HttpError(404, 'La categoría no existe');
  res.json({ ok: true });
});

// ===================== EJERCICIOS =====================
const ejercicioSchema = z.object({
  idCategoria: z.number({ error: 'Elegí una categoría' }).int().positive('Elegí una categoría'),
  titulo: z.string({ error: 'El título es obligatorio' }).trim().min(3, 'El título debe tener al menos 3 caracteres').max(60, 'Máximo 60 caracteres'),
  descripcion: z.string({ error: 'La descripción es obligatoria' }).trim().min(10, 'La descripción debe tener al menos 10 caracteres').max(400, 'Máximo 400 caracteres'),
  dificultad: z.enum(['Fácil', 'Medio', 'Avanzado'], { error: 'Dificultad inválida' }),
  xpRecompensa: z.number().int().min(10, 'Mínimo 10 XP').max(500, 'Máximo 500 XP').default(50),
  estadoInicial: estado3dSchema.default({ position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] }),
  estadoObjetivo: estado3dSchema,
});

const mapEjercicio = (e) => ({
  id: Number(e.id_ejercicio),
  idCategoria: Number(e.id_categoria),
  categoria: e.categoria,
  titulo: e.titulo,
  descripcion: e.descripcion,
  dificultad: e.dificultad,
  xpRecompensa: Number(e.xp_recompensa),
  estadoInicial: JSON.parse(e.estado_inicial_json),
  estadoObjetivo: JSON.parse(e.estado_objetivo_json),
  creadoPor: e.creado_por != null ? Number(e.creado_por) : null,
  autor: e.autor || null,
  completado: !!Number(e.completado || 0),
  intentos: Number(e.intentos || 0),
  valoracionPromedio: e.val_prom != null ? Math.round(Number(e.val_prom) * 10) / 10 : null,
  totalValoraciones: Number(e.val_total || 0),
  totalComentarios: Number(e.com_total || 0),
});

const SELECT_EJ = `
  SELECT e.*, c.nombre AS categoria, u.nombre AS autor, p.completado, p.intentos,
         (SELECT AVG(puntaje) FROM VALORACION v WHERE v.id_ejercicio = e.id_ejercicio) AS val_prom,
         (SELECT COUNT(*) FROM VALORACION v WHERE v.id_ejercicio = e.id_ejercicio) AS val_total,
         (SELECT COUNT(*) FROM COMENTARIO k WHERE k.id_ejercicio = e.id_ejercicio) AS com_total
    FROM EJERCICIO e
    JOIN CATEGORIA c ON c.id_categoria = e.id_categoria
    LEFT JOIN USUARIO u ON u.id_usuario = e.creado_por
    LEFT JOIN PROGRESO_USUARIO p ON p.id_ejercicio = e.id_ejercicio AND p.id_usuario = ?`;

router.get('/ejercicios', async (req, res) => {
  const filtros = [];
  const args = [req.user.id];
  if (req.query.categoria) { filtros.push('e.id_categoria = ?'); args.push(idParam(req.query.categoria)); }
  if (req.query.dificultad) { filtros.push('e.dificultad = ?'); args.push(String(req.query.dificultad)); }
  if (req.query.q) { filtros.push('(e.titulo LIKE ? OR e.descripcion LIKE ?)'); args.push(`%${req.query.q}%`, `%${req.query.q}%`); }
  if (req.query.mios === '1') { filtros.push('e.creado_por = ?'); args.push(req.user.id); }
  const where = filtros.length ? `WHERE ${filtros.join(' AND ')}` : '';
  const rows = await all(`${SELECT_EJ} ${where} ORDER BY c.id_categoria, CASE e.dificultad WHEN 'Fácil' THEN 1 WHEN 'Medio' THEN 2 ELSE 3 END, e.id_ejercicio`, args);
  res.json(rows.map(mapEjercicio));
});

router.get('/ejercicios/:id', async (req, res) => {
  const id = idParam(req.params.id);
  const e = await get(`${SELECT_EJ} WHERE e.id_ejercicio = ?`, [req.user.id, id]);
  if (!e) throw new HttpError(404, 'El ejercicio no existe o fue eliminado');
  const mia = await get('SELECT puntaje FROM VALORACION WHERE id_usuario = ? AND id_ejercicio = ?', [req.user.id, id]);
  res.json({ ...mapEjercicio(e), miValoracion: mia ? Number(mia.puntaje) : null });
});

router.post('/ejercicios', requireRole(...DOCENTES), async (req, res) => {
  const d = validate(ejercicioSchema, req.body);
  const cat = await get('SELECT nombre FROM CATEGORIA WHERE id_categoria = ?', [d.idCategoria]);
  if (!cat) throw new HttpError(400, 'La categoría elegida no existe', { idCategoria: 'La categoría no existe' });
  const { lastId } = await run(
    `INSERT INTO EJERCICIO (id_categoria, titulo, descripcion, dificultad, xp_recompensa, estado_inicial_json, estado_objetivo_json, creado_por)
     VALUES (?,?,?,?,?,?,?,?)`,
    [d.idCategoria, d.titulo, d.descripcion, d.dificultad, d.xpRecompensa, JSON.stringify(d.estadoInicial), JSON.stringify(d.estadoObjetivo), req.user.id]
  );
  // Evento relevante → notificación a todos los estudiantes.
  const estudiantes = await all("SELECT id_usuario FROM USUARIO WHERE rol = 'estudiante'");
  await notificarVarios(
    estudiantes.map((s) => Number(s.id_usuario)),
    '🧊 Nuevo ejercicio disponible',
    `${req.user.nombre} publicó "${d.titulo}" en ${cat.nombre} (${d.dificultad}, +${d.xpRecompensa} XP).`,
    'ejercicio',
    { idEjercicio: lastId }
  );
  const e = await get(`${SELECT_EJ} WHERE e.id_ejercicio = ?`, [req.user.id, lastId]);
  res.status(201).json(mapEjercicio(e));
});

async function puedeEditar(req, id) {
  const e = await get('SELECT creado_por FROM EJERCICIO WHERE id_ejercicio = ?', [id]);
  if (!e) throw new HttpError(404, 'El ejercicio no existe');
  if (req.user.rol !== 'admin' && Number(e.creado_por) !== req.user.id) {
    throw new HttpError(403, 'Solo podés modificar los ejercicios que creaste');
  }
}

router.put('/ejercicios/:id', requireRole(...DOCENTES), async (req, res) => {
  const id = idParam(req.params.id);
  await puedeEditar(req, id);
  const d = validate(ejercicioSchema, req.body);
  await run(
    `UPDATE EJERCICIO SET id_categoria = ?, titulo = ?, descripcion = ?, dificultad = ?, xp_recompensa = ?, estado_inicial_json = ?, estado_objetivo_json = ?
      WHERE id_ejercicio = ?`,
    [d.idCategoria, d.titulo, d.descripcion, d.dificultad, d.xpRecompensa, JSON.stringify(d.estadoInicial), JSON.stringify(d.estadoObjetivo), id]
  );
  const e = await get(`${SELECT_EJ} WHERE e.id_ejercicio = ?`, [req.user.id, id]);
  res.json(mapEjercicio(e));
});

router.delete('/ejercicios/:id', requireRole(...DOCENTES), async (req, res) => {
  const id = idParam(req.params.id);
  await puedeEditar(req, id);
  await run('DELETE FROM EJERCICIO WHERE id_ejercicio = ?', [id]);
  res.json({ ok: true });
});

router.post('/ejercicios/:id/validar', async (req, res) => {
  const id = idParam(req.params.id);
  const { estado } = validate(z.object({ estado: estado3dSchema }), req.body);
  const e = await get('SELECT * FROM EJERCICIO WHERE id_ejercicio = ?', [id]);
  if (!e) throw new HttpError(404, 'El ejercicio no existe o fue eliminado');
  res.json(await validarIntento(req.user.id, e, estado));
});

// ===================== COMENTARIOS =====================
router.get('/ejercicios/:id/comentarios', async (req, res) => {
  const id = idParam(req.params.id);
  const rows = await all(
    `SELECT k.*, u.nombre, u.rol, u.avatar FROM COMENTARIO k JOIN USUARIO u ON u.id_usuario = k.id_usuario
      WHERE k.id_ejercicio = ? ORDER BY k.creado_en ASC, k.id_comentario ASC`,
    [id]
  );
  const items = rows.map((k) => ({
    id: Number(k.id_comentario),
    idPadre: k.id_padre != null ? Number(k.id_padre) : null,
    texto: k.texto,
    creadoEn: k.creado_en,
    autor: { id: Number(k.id_usuario), nombre: k.nombre, rol: k.rol, avatar: k.avatar },
    puedeBorrar: Number(k.id_usuario) === req.user.id || req.user.rol !== 'estudiante',
  }));
  // Árbol de un nivel: comentarios raíz con sus respuestas.
  const raices = items.filter((i) => !i.idPadre).map((r) => ({ ...r, respuestas: items.filter((i) => i.idPadre === r.id) }));
  res.json(raices.reverse());
});

router.post('/ejercicios/:id/comentarios', async (req, res) => {
  const id = idParam(req.params.id);
  const { texto, idPadre } = validate(
    z.object({ texto: z.string({ error: 'Escribí un comentario' }).trim().min(2, 'El comentario es muy corto').max(500, 'Máximo 500 caracteres'), idPadre: z.number().int().positive().nullish() }),
    req.body
  );
  const ej = await get('SELECT titulo, creado_por FROM EJERCICIO WHERE id_ejercicio = ?', [id]);
  if (!ej) throw new HttpError(404, 'El ejercicio no existe');
  let padre = null;
  if (idPadre) {
    padre = await get('SELECT id_usuario, id_padre FROM COMENTARIO WHERE id_comentario = ? AND id_ejercicio = ?', [idPadre, id]);
    if (!padre) throw new HttpError(404, 'El comentario al que respondés ya no existe');
    if (padre.id_padre) throw new HttpError(400, 'Solo se puede responder a comentarios principales');
  }
  const { lastId } = await run('INSERT INTO COMENTARIO (id_ejercicio, id_usuario, id_padre, texto) VALUES (?,?,?,?)', [id, req.user.id, idPadre || null, texto]);

  const avisar = new Set();
  if (padre && Number(padre.id_usuario) !== req.user.id) avisar.add(Number(padre.id_usuario));
  if (ej.creado_por && Number(ej.creado_por) !== req.user.id) avisar.add(Number(ej.creado_por));
  for (const uid of avisar) {
    await notificar(uid, padre && uid === Number(padre.id_usuario) ? '💬 Te respondieron' : '💬 Nuevo comentario', `${req.user.nombre} en "${ej.titulo}": ${texto.slice(0, 80)}`, 'comentario', { idEjercicio: id });
  }
  res.status(201).json({ id: lastId });
});

router.delete('/comentarios/:id', async (req, res) => {
  const id = idParam(req.params.id);
  const k = await get('SELECT id_usuario FROM COMENTARIO WHERE id_comentario = ?', [id]);
  if (!k) throw new HttpError(404, 'El comentario no existe');
  // Moderación: el autor, profesores y admins pueden borrar.
  if (Number(k.id_usuario) !== req.user.id && req.user.rol === 'estudiante') throw new HttpError(403, 'No podés borrar comentarios de otros usuarios');
  await run('DELETE FROM COMENTARIO WHERE id_comentario = ?', [id]);
  res.json({ ok: true });
});

// ===================== VALORACIONES =====================
router.put('/ejercicios/:id/valoracion', async (req, res) => {
  const id = idParam(req.params.id);
  const { puntaje } = validate(z.object({ puntaje: z.number({ error: 'Elegí de 1 a 5 estrellas' }).int().min(1).max(5) }), req.body);
  const ej = await get('SELECT 1 FROM EJERCICIO WHERE id_ejercicio = ?', [id]);
  if (!ej) throw new HttpError(404, 'El ejercicio no existe');
  await run(
    `INSERT INTO VALORACION (id_usuario, id_ejercicio, puntaje) VALUES (?,?,?)
     ON CONFLICT(id_usuario, id_ejercicio) DO UPDATE SET puntaje = excluded.puntaje, creado_en = CURRENT_TIMESTAMP`,
    [req.user.id, id, puntaje]
  );
  const r = await get('SELECT AVG(puntaje) AS prom, COUNT(*) AS n FROM VALORACION WHERE id_ejercicio = ?', [id]);
  res.json({ miValoracion: puntaje, valoracionPromedio: Math.round(Number(r.prom) * 10) / 10, totalValoraciones: Number(r.n) });
});

// ===================== RANKING =====================
router.get('/ranking', async (req, res) => {
  const rows = await all(
    `SELECT u.id_usuario, u.nombre, u.avatar, u.xp_total, u.nivel, u.racha_actual,
            (SELECT COUNT(*) FROM PROGRESO_USUARIO p WHERE p.id_usuario = u.id_usuario AND p.completado = 1) AS completados
       FROM USUARIO u WHERE u.rol = 'estudiante' ORDER BY u.xp_total DESC, u.id_usuario ASC LIMIT 20`
  );
  res.json(rows.map((u, i) => ({
    posicion: i + 1, id: Number(u.id_usuario), nombre: u.nombre, avatar: u.avatar, xp: Number(u.xp_total),
    nivel: Number(u.nivel), racha: Number(u.racha_actual), completados: Number(u.completados), soyYo: Number(u.id_usuario) === req.user.id,
  })));
});

export default router;

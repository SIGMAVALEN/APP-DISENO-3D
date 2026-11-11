// Interacción entre usuarios: perfil público y "saludos" prefijados
// (un emoji + un mensaje corto que se le manda a otro usuario).
// Los mensajes son de una lista cerrada: no hay texto libre, así que no hace falta moderarlos.
import { Router } from 'express';
import { z } from 'zod';
import { all, get, run } from '../db.js';
import { HttpError, validate, idParam } from '../lib/http.js';
import { requireAuth } from '../lib/auth.js';
import { rangoDesdeNivel } from '../lib/game.js';
import { notificar } from '../services/notifications.js';

const router = Router();
router.use(requireAuth);

export const SALUDOS = [
  { codigo: 'GENIO', emoji: '🧠', texto: '¡Genio!' },
  { codigo: 'CRACK', emoji: '🚀', texto: '¡Crack total!' },
  { codigo: 'FUEGO', emoji: '🔥', texto: '¡Estás on fire!' },
  { codigo: 'APLAUSO', emoji: '👏', texto: '¡Aplausos!' },
  { codigo: 'BANCO', emoji: '💜', texto: '¡Te banco!' },
  { codigo: 'RISA', emoji: '😂', texto: 'Jajaja' },
  { codigo: 'TORTUGA', emoji: '🐢', texto: '¡Dale que vas lento!' },
  { codigo: 'BURRO', emoji: '🫏', texto: '¡Burro!' },
];
const PORCODIGO = Object.fromEntries(SALUDOS.map((s) => [s.codigo, s]));

// Anti-spam: máximo de saludos por día de una persona a otra.
export const MAX_SALUDOS_DIA = 5;

const mapSaludo = (r) => ({
  id: Number(r.id_saludo),
  ...(PORCODIGO[r.codigo] || { codigo: r.codigo, emoji: '💬', texto: r.codigo }),
  creadoEn: r.creado_en,
  de: { id: Number(r.id_de), nombre: r.nombre, avatar: r.avatar },
});

router.get('/saludos/catalogo', (_req, res) => {
  res.json({ saludos: SALUDOS, maxPorDia: MAX_SALUDOS_DIA });
});

router.get('/usuarios/:id/perfil', async (req, res) => {
  const id = idParam(req.params.id);
  const u = await get('SELECT id_usuario, nombre, avatar, rol, nivel, xp_total, racha_actual, racha_maxima, creado_en FROM USUARIO WHERE id_usuario = ?', [id]);
  if (!u) throw new HttpError(404, 'El usuario no existe o borró su cuenta');

  const { completados } = await get('SELECT COUNT(*) AS completados FROM PROGRESO_USUARIO WHERE id_usuario = ? AND completado = 1', [id]);
  const aportes = await all(
    `SELECT e.id_ejercicio, e.titulo, e.dificultad,
            (SELECT AVG(puntaje) FROM VALORACION v WHERE v.id_ejercicio = e.id_ejercicio) AS val
       FROM EJERCICIO e WHERE e.creado_por = ? ORDER BY e.id_ejercicio DESC LIMIT 10`,
    [id]
  );
  const insignias = await all(
    `SELECT i.codigo, i.nombre, i.icono FROM USUARIO_INSIGNIA ui JOIN INSIGNIA i ON i.id_insignia = ui.id_insignia
      WHERE ui.id_usuario = ? ORDER BY ui.obtenida_en DESC`,
    [id]
  );
  const resumen = await all('SELECT codigo, COUNT(*) AS n FROM SALUDO WHERE id_para = ? GROUP BY codigo ORDER BY n DESC', [id]);
  const recientes = await all(
    `SELECT s.*, u.nombre, u.avatar FROM SALUDO s JOIN USUARIO u ON u.id_usuario = s.id_de
      WHERE s.id_para = ? ORDER BY s.id_saludo DESC LIMIT 15`,
    [id]
  );
  const { hoy } = await get(
    "SELECT COUNT(*) AS hoy FROM SALUDO WHERE id_de = ? AND id_para = ? AND creado_en >= datetime('now', '-1 day')",
    [req.user.id, id]
  );

  const nivel = Number(u.nivel);
  res.json({
    usuario: {
      id: Number(u.id_usuario), nombre: u.nombre, avatar: u.avatar, rol: u.rol, nivel, xp: Number(u.xp_total),
      rango: rangoDesdeNivel(nivel), racha: Number(u.racha_actual), rachaMaxima: Number(u.racha_maxima), creadoEn: u.creado_en,
    },
    esYo: id === req.user.id,
    completados: Number(completados),
    aportes: aportes.map((a) => ({ id: Number(a.id_ejercicio), titulo: a.titulo, dificultad: a.dificultad, valoracion: a.val != null ? Math.round(Number(a.val) * 10) / 10 : null })),
    insignias,
    saludos: {
      total: resumen.reduce((n, r) => n + Number(r.n), 0),
      resumen: resumen.filter((r) => PORCODIGO[r.codigo]).map((r) => ({ ...PORCODIGO[r.codigo], n: Number(r.n) })),
      recientes: recientes.map(mapSaludo),
    },
    catalogo: SALUDOS,
    restantesHoy: Math.max(0, MAX_SALUDOS_DIA - Number(hoy)),
  });
});

router.post('/usuarios/:id/saludos', async (req, res) => {
  const id = idParam(req.params.id);
  const { codigo } = validate(z.object({ codigo: z.enum(SALUDOS.map((s) => s.codigo), { error: 'Ese saludo no existe' }) }), req.body);
  if (id === req.user.id) throw new HttpError(400, 'No podés mandarte saludos a vos mismo 😅');
  const destino = await get('SELECT nombre FROM USUARIO WHERE id_usuario = ?', [id]);
  if (!destino) throw new HttpError(404, 'El usuario no existe o borró su cuenta');

  const { hoy } = await get(
    "SELECT COUNT(*) AS hoy FROM SALUDO WHERE id_de = ? AND id_para = ? AND creado_en >= datetime('now', '-1 day')",
    [req.user.id, id]
  );
  if (Number(hoy) >= MAX_SALUDOS_DIA) {
    throw new HttpError(429, `Ya le mandaste ${MAX_SALUDOS_DIA} saludos a ${destino.nombre} hoy. Probá mañana.`);
  }

  await run('INSERT INTO SALUDO (id_de, id_para, codigo) VALUES (?,?,?)', [req.user.id, id, codigo]);
  const s = PORCODIGO[codigo];
  await notificar(id, `${s.emoji} ${req.user.nombre} te mandó un saludo`, s.texto, 'saludo', { idUsuario: req.user.id });
  res.status(201).json({ ok: true, saludo: s, restantesHoy: MAX_SALUDOS_DIA - Number(hoy) - 1 });
});

// Saludos que recibí (para la sección "Lo que te dijeron" de mi perfil).
router.get('/me/saludos', async (req, res) => {
  const rows = await all(
    `SELECT s.*, u.nombre, u.avatar FROM SALUDO s JOIN USUARIO u ON u.id_usuario = s.id_de
      WHERE s.id_para = ? ORDER BY s.id_saludo DESC LIMIT 30`,
    [req.user.id]
  );
  res.json(rows.map(mapSaludo));
});

export default router;

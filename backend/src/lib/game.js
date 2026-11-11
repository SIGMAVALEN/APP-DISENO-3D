import { all, get, run } from '../db.js';
import { notificar } from '../services/notifications.js';

export const XP_POR_NIVEL = 150;
export const nivelDesdeXp = (xp) => Math.floor(Number(xp) / XP_POR_NIVEL) + 1;

export function rangoDesdeNivel(nivel) {
  if (nivel >= 11) return 'Maestro del Render';
  if (nivel >= 8) return 'Modelador Senior';
  if (nivel >= 5) return 'Modelador Junior';
  if (nivel >= 3) return 'Aprendiz de Vértices';
  return 'Novato 3D';
}

/** Vista pública/segura del usuario (nunca expone hashes). */
export function vistaUsuario(u) {
  if (!u) return null;
  const xp = Number(u.xp_total || 0);
  const nivel = Number(u.nivel || 1);
  return {
    id: Number(u.id_usuario),
    nombre: u.nombre,
    email: u.email,
    rol: u.rol,
    avatar: u.avatar || null,
    nivel,
    xp,
    rango: rangoDesdeNivel(nivel),
    xpNivelActual: xp - (nivel - 1) * XP_POR_NIVEL,
    xpParaSiguiente: XP_POR_NIVEL,
    tema: u.tema || 'system',
    notifActivas: !!Number(u.notif_activas ?? 1),
    rachaActual: Number(u.racha_actual || 0),
    rachaMaxima: Number(u.racha_maxima || 0),
    tieneGoogle: !!u.google_id,
    tienePassword: !!u.password_hash,
    creadoEn: u.creado_en,
  };
}

export async function usuarioPorId(id) {
  return get('SELECT * FROM USUARIO WHERE id_usuario = ?', [id]);
}

// ---------- Comparación de estados 3D ----------
export const TOLERANCIA = { position: 0.15, rotation: 3, scale: 0.06 };
const ejes = ['X', 'Y', 'Z'];
const difAngulo = (a, b) => {
  const d = (((a - b) % 360) + 540) % 360 - 180;
  return Math.abs(d);
};

/** Devuelve { correcto, pistas[] } comparando el estado actual con el objetivo. */
export function compararEstados(actual, objetivo) {
  const pistas = [];
  for (let i = 0; i < 3; i++) {
    const dp = objetivo.position[i] - actual.position[i];
    if (Math.abs(dp) > TOLERANCIA.position) pistas.push(`Posición ${ejes[i]}: te faltan ${dp > 0 ? '+' : ''}${round(dp)} unidades`);
    if (difAngulo(actual.rotation[i], objetivo.rotation[i]) > TOLERANCIA.rotation) pistas.push(`Rotación ${ejes[i]}: revisá el ángulo (objetivo ${round(objetivo.rotation[i])}°)`);
    if (Math.abs(objetivo.scale[i] - actual.scale[i]) > TOLERANCIA.scale) pistas.push(`Escala ${ejes[i]}: debería ser ${round(objetivo.scale[i])}`);
  }
  return { correcto: pistas.length === 0, pistas };
}
const round = (n) => Math.round(n * 100) / 100;

// ---------- Racha diaria ----------
const hoyAR = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10); // UTC-3 (Argentina)

export async function registrarActividad(idUsuario) {
  const u = await get('SELECT racha_actual, racha_maxima, ultima_actividad FROM USUARIO WHERE id_usuario = ?', [idUsuario]);
  const hoy = hoyAR();
  if (u.ultima_actividad === hoy) return Number(u.racha_actual);
  const ayer = new Date(Date.parse(hoy) - 86400_000).toISOString().slice(0, 10);
  const racha = u.ultima_actividad === ayer ? Number(u.racha_actual) + 1 : 1;
  await run('UPDATE USUARIO SET racha_actual = ?, racha_maxima = MAX(racha_maxima, ?), ultima_actividad = ? WHERE id_usuario = ?', [racha, racha, hoy, idUsuario]);
  return racha;
}

// ---------- Insignias ----------
async function otorgar(idUsuario, codigo) {
  const ins = await get('SELECT * FROM INSIGNIA WHERE codigo = ?', [codigo]);
  if (!ins) return null;
  const r = await run('INSERT OR IGNORE INTO USUARIO_INSIGNIA (id_usuario, id_insignia) VALUES (?,?)', [idUsuario, ins.id_insignia]);
  if (!r.changes) return null;
  await notificar(idUsuario, '🏅 ¡Nueva insignia!', `Desbloqueaste "${ins.nombre}": ${ins.descripcion}`, 'insignia', { codigo });
  return { codigo: ins.codigo, nombre: ins.nombre, descripcion: ins.descripcion, icono: ins.icono };
}

async function evaluarInsignias(idUsuario, ejercicio, racha, nivel) {
  const nuevas = [];
  const { n } = await get('SELECT COUNT(*) AS n FROM PROGRESO_USUARIO WHERE id_usuario = ? AND completado = 1', [idUsuario]);
  const total = Number(n);
  const add = async (cond, cod) => { if (cond) { const i = await otorgar(idUsuario, cod); if (i) nuevas.push(i); } };
  await add(total >= 1, 'PRIMER_EJERCICIO');
  await add(total >= 5, 'CINCO_EJERCICIOS');
  await add(racha >= 3, 'RACHA_3');
  await add(racha >= 7, 'RACHA_7');
  await add(nivel >= 5, 'NIVEL_5');
  await add(ejercicio.dificultad === 'Avanzado', 'AVANZADO');
  const cat = await get(
    `SELECT COUNT(*) AS total,
            SUM(CASE WHEN p.completado = 1 THEN 1 ELSE 0 END) AS hechos
       FROM EJERCICIO e LEFT JOIN PROGRESO_USUARIO p ON p.id_ejercicio = e.id_ejercicio AND p.id_usuario = ?
      WHERE e.id_categoria = ?`,
    [idUsuario, ejercicio.id_categoria]
  );
  await add(Number(cat.total) > 0 && Number(cat.hechos) === Number(cat.total), 'CATEGORIA_COMPLETA');
  return nuevas;
}

/**
 * Valida un intento del usuario. La comparación se hace en el servidor para que
 * nadie pueda sumar XP enviando "completado = true" desde la app.
 */
export async function validarIntento(idUsuario, ejercicio, estado) {
  const objetivo = JSON.parse(ejercicio.estado_objetivo_json);
  const { correcto, pistas } = compararEstados(estado, objetivo);

  const previo = await get('SELECT * FROM PROGRESO_USUARIO WHERE id_usuario = ? AND id_ejercicio = ?', [idUsuario, ejercicio.id_ejercicio]);
  if (!previo) {
    await run('INSERT INTO PROGRESO_USUARIO (id_usuario, id_ejercicio, completado, intentos) VALUES (?,?,0,0)', [idUsuario, ejercicio.id_ejercicio]);
  }
  await run('UPDATE PROGRESO_USUARIO SET intentos = intentos + 1, ultimo_intento = CURRENT_TIMESTAMP WHERE id_usuario = ? AND id_ejercicio = ?', [idUsuario, ejercicio.id_ejercicio]);

  const racha = await registrarActividad(idUsuario);
  const yaCompletado = previo && Number(previo.completado) === 1;

  if (!correcto) {
    return { correcto: false, pistas, xpGanada: 0, yaCompletado, usuario: vistaUsuario(await usuarioPorId(idUsuario)) };
  }
  if (yaCompletado) {
    return { correcto: true, pistas: [], xpGanada: 0, yaCompletado: true, insigniasNuevas: [], usuario: vistaUsuario(await usuarioPorId(idUsuario)) };
  }

  await run('UPDATE PROGRESO_USUARIO SET completado = 1, completado_en = CURRENT_TIMESTAMP WHERE id_usuario = ? AND id_ejercicio = ?', [idUsuario, ejercicio.id_ejercicio]);
  const antes = await usuarioPorId(idUsuario);
  const xp = Number(antes.xp_total) + Number(ejercicio.xp_recompensa);
  const nivel = nivelDesdeXp(xp);
  const subioNivel = nivel > Number(antes.nivel);
  await run('UPDATE USUARIO SET xp_total = ?, nivel = ? WHERE id_usuario = ?', [xp, nivel, idUsuario]);
  if (subioNivel) {
    await notificar(idUsuario, '⬆️ ¡Subiste de nivel!', `Ahora sos nivel ${nivel}: ${rangoDesdeNivel(nivel)}.`, 'nivel', { nivel });
  }
  const insigniasNuevas = await evaluarInsignias(idUsuario, ejercicio, racha, nivel);
  return {
    correcto: true,
    pistas: [],
    xpGanada: Number(ejercicio.xp_recompensa),
    subioNivel,
    yaCompletado: false,
    insigniasNuevas,
    usuario: vistaUsuario(await usuarioPorId(idUsuario)),
  };
}

export async function estadisticasUsuario(idUsuario) {
  const u = await usuarioPorId(idUsuario);
  if (!u) return null;
  const completados = await all(
    `SELECT e.id_ejercicio AS id, e.titulo, e.dificultad, c.nombre AS categoria, p.completado_en
       FROM PROGRESO_USUARIO p JOIN EJERCICIO e ON e.id_ejercicio = p.id_ejercicio
       JOIN CATEGORIA c ON c.id_categoria = e.id_categoria
      WHERE p.id_usuario = ? AND p.completado = 1 ORDER BY p.completado_en DESC`,
    [idUsuario]
  );
  const { total } = await get('SELECT COUNT(*) AS total FROM EJERCICIO');
  const { intentos } = await get('SELECT COALESCE(SUM(intentos),0) AS intentos FROM PROGRESO_USUARIO WHERE id_usuario = ?', [idUsuario]);
  const insignias = await all(
    `SELECT i.codigo, i.nombre, i.descripcion, i.icono, ui.obtenida_en,
            CASE WHEN ui.id_usuario IS NULL THEN 0 ELSE 1 END AS obtenida
       FROM INSIGNIA i LEFT JOIN USUARIO_INSIGNIA ui ON ui.id_insignia = i.id_insignia AND ui.id_usuario = ?
      ORDER BY obtenida DESC, i.id_insignia`,
    [idUsuario]
  );
  const v = vistaUsuario(u);
  return {
    usuario: v,
    nivel: v.nivel,
    xp: v.xp,
    rango: v.rango,
    rachaActual: v.rachaActual,
    ejerciciosCompletados: completados.length,
    ejerciciosTotales: Number(total),
    intentosTotales: Number(intentos),
    completados,
    insignias: insignias.map((i) => ({ ...i, obtenida: !!Number(i.obtenida) })),
  };
}

// Procesos en segundo plano del servidor.
// 1) Recordatorio diario de racha (19:00 hora Argentina).
// 2) Limpieza de códigos de recuperación vencidos y notificaciones viejas.
//
// Render free "duerme" el servicio tras 15 min sin tráfico, así que además
// se exponen como endpoint protegido (/api/tareas/:nombre) para que un cron
// externo gratuito (cron-job.org o GitHub Actions) los dispare.
import cron from 'node-cron';
import { all, run } from '../db.js';
import { notificarVarios } from './notifications.js';

export async function recordatorioRacha() {
  const hoy = new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
  const ayer = new Date(Date.parse(hoy) - 86400_000).toISOString().slice(0, 10);
  const pendientes = await all(
    'SELECT id_usuario FROM USUARIO WHERE racha_actual > 0 AND ultima_actividad = ?',
    [ayer]
  );
  await notificarVarios(
    pendientes.map((u) => Number(u.id_usuario)),
    '🔥 ¡No pierdas tu racha!',
    'Completá un ejercicio hoy para mantener tu racha de práctica.',
    'recordatorio'
  );
  // Rachas cortadas: quien no practicó ni ayer ni hoy vuelve a 0.
  await run('UPDATE USUARIO SET racha_actual = 0 WHERE ultima_actividad < ? AND racha_actual > 0', [ayer]);
  return { avisados: pendientes.length };
}

export async function limpieza() {
  const a = await run('DELETE FROM RESET_PASSWORD WHERE expira_en < ? OR usado = 1', [Date.now() - 3600_000]);
  const b = await run("DELETE FROM NOTIFICACION WHERE leida = 1 AND creado_en < datetime('now', '-30 days')");
  return { codigosBorrados: a.changes, notificacionesBorradas: b.changes };
}

export const TAREAS = { 'recordatorio-racha': recordatorioRacha, limpieza };

export function iniciarJobs() {
  const tz = { timezone: 'America/Argentina/Buenos_Aires' };
  cron.schedule('0 19 * * *', () => recordatorioRacha().catch((e) => console.error('[cron racha]', e)), tz);
  cron.schedule('15 3 * * *', () => limpieza().catch((e) => console.error('[cron limpieza]', e)), tz);
  console.log('[cron] Tareas programadas activas (recordatorio 19:00, limpieza 03:15).');
}

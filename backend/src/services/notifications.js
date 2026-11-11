// Notificaciones: se guardan en la base (bandeja dentro de la app) y, si el usuario
// tiene un token registrado y las notificaciones activas, se envían como push
// a través del servicio de Expo (funciona en el APK y en Expo Go).
import { Expo } from 'expo-server-sdk';
import { all, get, run } from '../db.js';
import { config } from '../config.js';

const expo = new Expo(config.expoAccessToken ? { accessToken: config.expoAccessToken } : {});

export async function notificar(idUsuario, titulo, cuerpo, tipo = 'general', data = {}) {
  await run('INSERT INTO NOTIFICACION (id_usuario, titulo, cuerpo, tipo, data_json) VALUES (?,?,?,?,?)', [
    idUsuario, titulo, cuerpo, tipo, JSON.stringify(data),
  ]);
  // El envío push no debe bloquear ni romper la operación principal.
  enviarPush([idUsuario], titulo, cuerpo, { tipo, ...data }).catch((e) => console.warn('[push]', e.message));
}

export async function notificarVarios(ids, titulo, cuerpo, tipo = 'general', data = {}) {
  for (const id of ids) {
    await run('INSERT INTO NOTIFICACION (id_usuario, titulo, cuerpo, tipo, data_json) VALUES (?,?,?,?,?)', [
      id, titulo, cuerpo, tipo, JSON.stringify(data),
    ]);
  }
  enviarPush(ids, titulo, cuerpo, { tipo, ...data }).catch((e) => console.warn('[push]', e.message));
}

export async function enviarPush(ids, title, body, data) {
  if (!ids.length) return;
  const placeholders = ids.map(() => '?').join(',');
  const tokens = await all(
    `SELECT t.token FROM PUSH_TOKEN t JOIN USUARIO u ON u.id_usuario = t.id_usuario
      WHERE t.id_usuario IN (${placeholders}) AND u.notif_activas = 1`,
    ids
  );
  const mensajes = tokens
    .map((t) => t.token)
    .filter((t) => Expo.isExpoPushToken(t))
    .map((to) => ({ to, sound: 'default', title, body, data, channelId: 'default' }));
  if (!mensajes.length) return;

  for (const chunk of expo.chunkPushNotifications(mensajes)) {
    const tickets = await expo.sendPushNotificationsAsync(chunk);
    // Limpia tokens de dispositivos que desinstalaron la app.
    for (let i = 0; i < tickets.length; i++) {
      if (tickets[i].status === 'error' && tickets[i].details?.error === 'DeviceNotRegistered') {
        await run('DELETE FROM PUSH_TOKEN WHERE token = ?', [chunk[i].to]);
      }
    }
  }
}

export async function guardarPushToken(idUsuario, token, plataforma) {
  if (!Expo.isExpoPushToken(token)) return false;
  const existente = await get('SELECT token FROM PUSH_TOKEN WHERE token = ?', [token]);
  if (existente) await run('UPDATE PUSH_TOKEN SET id_usuario = ?, plataforma = ? WHERE token = ?', [idUsuario, plataforma, token]);
  else await run('INSERT INTO PUSH_TOKEN (token, id_usuario, plataforma) VALUES (?,?,?)', [token, idUsuario, plataforma]);
  return true;
}

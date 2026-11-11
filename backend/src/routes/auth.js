import { Router } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { OAuth2Client } from 'google-auth-library';
import { get, run } from '../db.js';
import { config } from '../config.js';
import { HttpError, validate, emailSchema, passwordSchema, nombreSchema } from '../lib/http.js';
import { firmarToken, requireAuth } from '../lib/auth.js';
import { vistaUsuario, usuarioPorId } from '../lib/game.js';
import { enviarEmail, plantillaCodigo } from '../services/mailer.js';
import { guardarPushToken } from '../services/notifications.js';

const router = Router();

// Protección contra fuerza bruta en endpoints sensibles.
const limiteAuth = rateLimit({ windowMs: 15 * 60_000, limit: 30, standardHeaders: true, legacyHeaders: false, message: { error: 'Demasiados intentos. Esperá unos minutos.' } });
const limiteReset = rateLimit({ windowMs: 15 * 60_000, limit: 8, standardHeaders: true, legacyHeaders: false, message: { error: 'Demasiados pedidos de recuperación. Esperá unos minutos.' } });

const respuestaSesion = async (u) => ({ token: firmarToken(u), usuario: vistaUsuario(await usuarioPorId(u.id_usuario)) });

router.post('/register', limiteAuth, async (req, res) => {
  const { nombre, email, password } = validate(z.object({ nombre: nombreSchema, email: emailSchema, password: passwordSchema }), req.body);
  const existe = await get('SELECT 1 FROM USUARIO WHERE email = ?', [email]);
  if (existe) throw new HttpError(409, 'Ya existe una cuenta con ese email', { email: 'Ya existe una cuenta con ese email' });
  const hash = await bcrypt.hash(password, 10);
  const { lastId } = await run('INSERT INTO USUARIO (nombre, email, password_hash) VALUES (?,?,?)', [nombre, email, hash]);
  res.status(201).json(await respuestaSesion(await usuarioPorId(lastId)));
});

router.post('/login', limiteAuth, async (req, res) => {
  const { email, password } = validate(z.object({ email: emailSchema, password: z.string({ error: 'La contraseña es obligatoria' }).min(1, 'La contraseña es obligatoria') }), req.body);
  const u = await get('SELECT * FROM USUARIO WHERE email = ?', [email]);
  // Mismo mensaje para email inexistente o contraseña incorrecta (no revela qué cuentas existen).
  if (!u || !u.password_hash || !(await bcrypt.compare(password, u.password_hash))) {
    if (u && !u.password_hash && u.google_id) throw new HttpError(401, 'Esta cuenta se creó con Google. Usá "Continuar con Google".');
    throw new HttpError(401, 'Email o contraseña incorrectos');
  }
  res.json(await respuestaSesion(u));
});

// ---------- Social login con Google ----------
const googleClient = new OAuth2Client();
router.post('/google', limiteAuth, async (req, res) => {
  if (!config.googleClientIds.length) throw new HttpError(503, 'El inicio con Google no está configurado en el servidor');
  const { idToken } = validate(z.object({ idToken: z.string().min(20, 'Token de Google inválido') }), req.body);
  let payload;
  try {
    const ticket = await googleClient.verifyIdToken({ idToken, audience: config.googleClientIds });
    payload = ticket.getPayload();
  } catch {
    throw new HttpError(401, 'No se pudo verificar la cuenta de Google');
  }
  if (!payload?.email || !payload.email_verified) throw new HttpError(401, 'La cuenta de Google no tiene un email verificado');
  const email = payload.email.toLowerCase();
  let u = await get('SELECT * FROM USUARIO WHERE google_id = ? OR email = ?', [payload.sub, email]);
  if (u && !u.google_id) {
    await run('UPDATE USUARIO SET google_id = ?, avatar = COALESCE(avatar, ?) WHERE id_usuario = ?', [payload.sub, payload.picture || null, u.id_usuario]);
  } else if (!u) {
    const { lastId } = await run('INSERT INTO USUARIO (nombre, email, google_id, avatar) VALUES (?,?,?,?)', [
      (payload.name || email.split('@')[0]).slice(0, 60), email, payload.sub, payload.picture || null,
    ]);
    u = { id_usuario: lastId };
  }
  const completo = await usuarioPorId(u.id_usuario);
  res.json(await respuestaSesion(completo));
});

// ---------- Recuperar / restablecer contraseña ----------
router.post('/forgot', limiteReset, async (req, res) => {
  const { email } = validate(z.object({ email: emailSchema }), req.body);
  const u = await get('SELECT id_usuario, nombre FROM USUARIO WHERE email = ?', [email]);
  const respuesta = { ok: true, mensaje: 'Si el email está registrado, te enviamos un código de 6 dígitos.' };
  if (u) {
    const codigo = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
    await run('UPDATE RESET_PASSWORD SET usado = 1 WHERE id_usuario = ? AND usado = 0', [u.id_usuario]);
    await run('INSERT INTO RESET_PASSWORD (id_usuario, codigo_hash, expira_en) VALUES (?,?,?)', [
      u.id_usuario, await bcrypt.hash(codigo, 8), Date.now() + 15 * 60_000,
    ]);
    const { text, html } = plantillaCodigo(u.nombre, codigo);
    try {
      await enviarEmail({ to: email, subject: 'Tu código de recuperación — BlendGO!', text, html });
    } catch (e) {
      console.error('[mail]', e.message);
      throw new HttpError(502, 'No pudimos enviar el email. Intentá de nuevo más tarde.');
    }
    if (config.demoShowResetCode) respuesta.codigoDemo = codigo;
  }
  res.json(respuesta);
});

router.post('/reset', limiteReset, async (req, res) => {
  const { email, codigo, password } = validate(
    z.object({ email: emailSchema, codigo: z.string().regex(/^\d{6}$/, 'El código tiene 6 dígitos'), password: passwordSchema }),
    req.body
  );
  const u = await get('SELECT id_usuario FROM USUARIO WHERE email = ?', [email]);
  const pedido = u && (await get('SELECT * FROM RESET_PASSWORD WHERE id_usuario = ? AND usado = 0 ORDER BY id DESC LIMIT 1', [u.id_usuario]));
  if (!pedido || pedido.expira_en < Date.now()) throw new HttpError(400, 'El código venció o no es válido. Pedí uno nuevo.');
  if (pedido.intentos >= 5) throw new HttpError(429, 'Demasiados intentos con este código. Pedí uno nuevo.');
  if (!(await bcrypt.compare(codigo, pedido.codigo_hash))) {
    await run('UPDATE RESET_PASSWORD SET intentos = intentos + 1 WHERE id = ?', [pedido.id]);
    throw new HttpError(400, 'Código incorrecto', { codigo: 'Código incorrecto' });
  }
  await run('UPDATE RESET_PASSWORD SET usado = 1 WHERE id = ?', [pedido.id]);
  // token_version + 1 → se cierran todas las sesiones abiertas con la contraseña vieja.
  await run('UPDATE USUARIO SET password_hash = ?, token_version = token_version + 1 WHERE id_usuario = ?', [await bcrypt.hash(password, 10), u.id_usuario]);
  res.json(await respuestaSesion(await usuarioPorId(u.id_usuario)));
});

// ---------- Sesión ----------
router.get('/me', requireAuth, async (req, res) => {
  res.json({ usuario: vistaUsuario(await usuarioPorId(req.user.id)) });
});

router.post('/push-token', requireAuth, async (req, res) => {
  const { token, plataforma } = validate(z.object({ token: z.string().min(10), plataforma: z.string().max(20).optional() }), req.body);
  const ok = await guardarPushToken(req.user.id, token, plataforma || null);
  if (!ok) throw new HttpError(400, 'Token de notificaciones inválido');
  res.json({ ok: true });
});

router.post('/logout', requireAuth, async (req, res) => {
  // El JWT se borra en el dispositivo; acá desvinculamos el dispositivo de las notificaciones push.
  if (typeof req.body?.pushToken === 'string') await run('DELETE FROM PUSH_TOKEN WHERE token = ? AND id_usuario = ?', [req.body.pushToken, req.user.id]);
  res.json({ ok: true });
});

router.post('/logout-all', requireAuth, async (req, res) => {
  await run('UPDATE USUARIO SET token_version = token_version + 1 WHERE id_usuario = ?', [req.user.id]);
  await run('DELETE FROM PUSH_TOKEN WHERE id_usuario = ?', [req.user.id]);
  res.json({ ok: true });
});

export default router;

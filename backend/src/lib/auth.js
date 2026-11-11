import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { get } from '../db.js';
import { HttpError } from './http.js';

export function firmarToken(usuario) {
  return jwt.sign(
    { sub: usuario.id_usuario, rol: usuario.rol, v: usuario.token_version ?? 0 },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn }
  );
}

/**
 * Exige un JWT válido. Además consulta la base en cada pedido para:
 *  - rechazar tokens de usuarios eliminados,
 *  - invalidar tokens viejos cuando cambia la contraseña (token_version),
 *  - usar el rol ACTUAL (si un admin lo cambió, aplica de inmediato).
 */
export async function requireAuth(req, _res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return next(new HttpError(401, 'Necesitás iniciar sesión'));
  let payload;
  try {
    payload = jwt.verify(token, config.jwtSecret);
  } catch (e) {
    return next(new HttpError(401, e.name === 'TokenExpiredError' ? 'Tu sesión expiró. Iniciá sesión de nuevo.' : 'Sesión inválida'));
  }
  const user = await get('SELECT id_usuario, nombre, email, rol, token_version FROM USUARIO WHERE id_usuario = ?', [payload.sub]);
  if (!user) return next(new HttpError(401, 'El usuario ya no existe'));
  if (Number(user.token_version) !== Number(payload.v)) return next(new HttpError(401, 'Tu sesión fue cerrada. Iniciá sesión de nuevo.'));
  req.user = { id: Number(user.id_usuario), rol: user.rol, nombre: user.nombre, email: user.email };
  next();
}

/** Autorización por rol, controlada en el backend (no solo ocultando botones en la app). */
export const requireRole = (...roles) => (req, _res, next) => {
  if (!req.user) return next(new HttpError(401, 'Necesitás iniciar sesión'));
  if (!roles.includes(req.user.rol)) return next(new HttpError(403, 'No tenés permisos para realizar esta operación'));
  next();
};

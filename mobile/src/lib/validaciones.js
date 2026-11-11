// Validaciones del lado del cliente (el backend vuelve a validar todo).
export const validarEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(e).trim());

export function validarPassword(p) {
  if (!p || p.length < 8) return 'Mínimo 8 caracteres';
  if (!/[A-Za-z]/.test(p)) return 'Debe incluir al menos una letra';
  if (!/\d/.test(p)) return 'Debe incluir al menos un número';
  if (p.length > 72) return 'Es demasiado larga';
  return null;
}

export function validarNombre(n) {
  const t = String(n || '').trim();
  if (t.length < 2) return 'Mínimo 2 caracteres';
  if (t.length > 60) return 'Máximo 60 caracteres';
  return null;
}

/** Fuerza de contraseña 0-4 para el indicador visual. */
export function fuerzaPassword(p = '') {
  let s = 0;
  if (p.length >= 8) s++;
  if (p.length >= 12) s++;
  if (/[A-Z]/.test(p) && /[a-z]/.test(p)) s++;
  if (/\d/.test(p) && /[^A-Za-z0-9]/.test(p)) s++;
  return s;
}

import { z } from 'zod';

export class HttpError extends Error {
  constructor(status, message, campos) {
    super(message);
    this.status = status;
    this.campos = campos;
  }
}

/** Valida `data` con un esquema zod. Lanza 400 con mensajes por campo en español. */
export function validate(schema, data) {
  const r = schema.safeParse(data ?? {});
  if (r.success) return r.data;
  const campos = {};
  for (const issue of r.error.issues) {
    const key = issue.path.join('.') || '_';
    if (!campos[key]) campos[key] = issue.message;
  }
  const primero = Object.values(campos)[0];
  throw new HttpError(400, primero || 'Datos inválidos', campos);
}

export const idParam = (v) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw new HttpError(400, 'Identificador inválido');
  return n;
};

// Esquemas reutilizables
export const emailSchema = z.string({ error: 'El email es obligatorio' }).trim().toLowerCase().email('Formato de email inválido').max(120);
export const passwordSchema = z
  .string({ error: 'La contraseña es obligatoria' })
  .min(8, 'La contraseña debe tener al menos 8 caracteres')
  .max(72, 'La contraseña es demasiado larga')
  .regex(/[A-Za-z]/, 'La contraseña debe incluir al menos una letra')
  .regex(/\d/, 'La contraseña debe incluir al menos un número');
export const nombreSchema = z.string({ error: 'El nombre es obligatorio' }).trim().min(2, 'El nombre debe tener al menos 2 caracteres').max(60, 'El nombre es demasiado largo');

const vec3 = z.tuple([z.number().finite(), z.number().finite(), z.number().finite()], { error: 'Debe ser un vector [x, y, z]' });
export const estado3dSchema = z.object({
  position: vec3,
  rotation: vec3,
  scale: vec3.refine((v) => v.every((n) => n > 0 && n <= 20), 'La escala debe estar entre 0 y 20'),
});

export function errorHandler(err, req, res, _next) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message, ...(err.campos ? { campos: err.campos } : {}) });
  }
  if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: 'JSON mal formado' });
  if (err?.type === 'entity.too.large') return res.status(413).json({ error: 'La solicitud es demasiado grande' });
  if (String(err?.message || '').includes('UNIQUE constraint failed')) {
    return res.status(409).json({ error: 'El registro ya existe' });
  }
  console.error('[error]', err);
  res.status(500).json({ error: 'Error interno del servidor. Intentá de nuevo en unos minutos.' });
}

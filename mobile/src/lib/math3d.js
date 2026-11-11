// Matemática 3D mínima para el viewport: matrices de rotación (Euler XYZ, grados),
// cámara orbital y proyección perspectiva/ortográfica. Sin dependencias.
const RAD = Math.PI / 180;

export const ESTADO_DEFAULT = { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] };
export const clonarEstado = (e) => ({ position: [...e.position], rotation: [...e.rotation], scale: [...e.scale] });

/** Matriz de rotación 3x3 para Euler (orden XYZ, como Three.js / Blender por defecto). */
export function matrizRotacion([rx, ry, rz]) {
  const [a, b, c] = [rx * RAD, ry * RAD, rz * RAD];
  const ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b), cc = Math.cos(c), sc = Math.sin(c);
  // R = Rx * Ry * Rz
  return [
    [cb * cc, -cb * sc, sb],
    [ca * sc + sa * sb * cc, ca * cc - sa * sb * sc, -sa * cb],
    [sa * sc - ca * sb * cc, sa * cc + ca * sb * sc, ca * cb],
  ];
}
export const mulMV = (m, v) => [
  m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
  m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
  m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2],
];
const norm = (v) => { const l = Math.hypot(...v) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

// Cubo unitario centrado en el origen (objeto de práctica).
export const VERTICES = Array.from({ length: 8 }, (_, i) => [i & 1 ? 0.5 : -0.5, i & 2 ? 0.5 : -0.5, i & 4 ? 0.5 : -0.5]);
export const CARAS = [
  { idx: [0, 2, 6, 4], n: [-1, 0, 0] },
  { idx: [1, 3, 7, 5], n: [1, 0, 0] },
  { idx: [0, 1, 5, 4], n: [0, -1, 0] },
  { idx: [2, 3, 7, 6], n: [0, 1, 0] },
  { idx: [0, 1, 3, 2], n: [0, 0, -1] },
  { idx: [4, 5, 7, 6], n: [0, 0, 1] },
];
export const ARISTAS = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];

/** Transforma los vértices del cubo según el estado TRS (S → R → T). */
export function transformarCubo(estado) {
  const R = matrizRotacion(estado.rotation);
  const s = estado.scale, p = estado.position;
  const verts = VERTICES.map((v) => {
    const r = mulMV(R, [v[0] * s[0], v[1] * s[1], v[2] * s[2]]);
    return [r[0] + p[0], r[1] + p[1], r[2] + p[2]];
  });
  const normales = CARAS.map((f) => norm(mulMV(R, [f.n[0] / s[0], f.n[1] / s[1], f.n[2] / s[2]])));
  return { verts, normales, R };
}

/** Crea un proyector para una cámara orbital. */
export function crearCamara({ yaw, pitch, distancia, ancho, alto, orto, objetivo = [0, 0.6, 0] }) {
  const cy = Math.cos(yaw * RAD), sy = Math.sin(yaw * RAD), cp = Math.cos(pitch * RAD), sp = Math.sin(pitch * RAD);
  const f = Math.min(ancho, alto) * 1.25;
  const aCamara = (v) => {
    const x = v[0] - objetivo[0], y = v[1] - objetivo[1], z = v[2] - objetivo[2];
    const x1 = x * cy - z * sy, z1 = x * sy + z * cy;
    const y2 = y * cp - z1 * sp, z2 = y * sp + z1 * cp;
    return [x1, y2, z2];
  };
  const proyectar = (v) => {
    const [x, y, z] = aCamara(v);
    const prof = distancia - z;
    const k = orto ? f / distancia : f / Math.max(prof, 0.05);
    return { x: ancho / 2 + x * k, y: alto / 2 - y * k, prof };
  };
  const rotarDir = (d) => {
    const x1 = d[0] * cy - d[2] * sy, z1 = d[0] * sy + d[2] * cy;
    return [x1, d[1] * cp - z1 * sp, d[1] * sp + z1 * cp];
  };
  return { proyectar, aCamara, rotarDir, distancia, orto };
}

const LUZ = norm([0.45, 1, 0.65]);
/** Intensidad de iluminación lambertiana + ambiente para una normal en el mundo. */
export const iluminacion = (n) => 0.42 + 0.58 * Math.max(0, dot(n, LUZ));

/** Mezcla un color hex con negro/blanco según intensidad (0-1.2). */
export function sombrear(hex, i) {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => Math.round(Math.min(255, c * i)));
  return `rgb(${ch[0]},${ch[1]},${ch[2]})`;
}

/** ¿La cara es visible desde la cámara? (back-face culling) */
export function caraVisible(cam, normalMundo, centroMundo) {
  const n = cam.rotarDir(normalMundo);
  const c = cam.aCamara(centroMundo);
  const haciaCam = cam.orto ? [0, 0, 1] : [-c[0], -c[1], cam.distancia - c[2]];
  return dot(n, haciaCam) > 0;
}

/** Interpolación suave entre dos estados (para animar las órdenes de la IA). */
export function interpolarEstado(a, b, t) {
  const lerp = (x, y) => x + (y - x) * t;
  const lerpAng = (x, y) => { let d = ((y - x + 540) % 360) - 180; return x + d * t; };
  return {
    position: a.position.map((v, i) => lerp(v, b.position[i])),
    rotation: a.rotation.map((v, i) => lerpAng(v, b.rotation[i])),
    scale: a.scale.map((v, i) => lerp(v, b.scale[i])),
  };
}

const AXIS = { x: 0, y: 1, z: 2 };
const KEY = { move: 'position', rotate: 'rotation', scale: 'scale' };
const r3 = (n) => Math.round(n * 1000) / 1000;

/** Misma lógica que el backend: move/rotate suman, scale multiplica; absolute fija el valor. */
export function aplicarAccion(estado, accion) {
  if (accion.tipo === 'resetViewport') return clonarEstado(ESTADO_DEFAULT);
  const e = clonarEstado(estado);
  const k = KEY[accion.action];
  const i = AXIS[accion.axis];
  if (k === undefined || i === undefined) return e;
  if (accion.absolute) e[k][i] = accion.value;
  else if (accion.action === 'scale') e[k][i] *= accion.value;
  else e[k][i] += accion.value;
  if (accion.action === 'rotate') e[k][i] = ((((e[k][i] + 180) % 360) + 360) % 360) - 180;
  if (accion.action === 'scale') e[k][i] = Math.min(20, Math.max(0.05, e[k][i]));
  e[k][i] = r3(e[k][i]);
  return e;
}

/** Comparación local (solo para feedback offline; la validación oficial la hace el servidor). */
export function coincide(actual, objetivo) {
  const difAng = (a, b) => Math.abs(((a - b) % 360 + 540) % 360 - 180);
  for (let i = 0; i < 3; i++) {
    if (Math.abs(actual.position[i] - objetivo.position[i]) > 0.15) return false;
    if (difAng(actual.rotation[i], objetivo.rotation[i]) > 3) return false;
    if (Math.abs(actual.scale[i] - objetivo.scale[i]) > 0.06) return false;
  }
  return true;
}

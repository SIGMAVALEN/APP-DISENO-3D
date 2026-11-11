// Pruebas de integración de la API: node --test test/
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'blendgo-'));
process.env.DATABASE_URL = `file:${path.join(tmp, 'test.db')}`;
process.env.DEMO_SHOW_RESET_CODE = 'true';
process.env.GEMINI_API_KEY = '';
process.env.CRON_SECRET = 'secreto-test';

const { initDb } = await import('../src/db.js');
const { crearApp } = await import('../src/index.js');

let server, base;
before(async () => {
  await initDb();
  server = crearApp().listen(0);
  base = `http://127.0.0.1:${server.address().port}/api`;
});
after(() => server.close());

async function api(method, url, body, token) {
  const r = await fetch(base + url, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, body: await r.json() };
}
const login = async (email, password) => (await api('POST', '/auth/login', { email, password })).body.token;

test('registro con validaciones', async () => {
  let r = await api('POST', '/auth/register', { nombre: 'A', email: 'malo', password: '123' });
  assert.equal(r.status, 400);
  assert.ok(r.body.campos.nombre && r.body.campos.email && r.body.campos.password);
  r = await api('POST', '/auth/register', { nombre: 'Test User', email: 'Test@Mail.com', password: 'clave1234' });
  assert.equal(r.status, 201);
  assert.ok(r.body.token);
  assert.equal(r.body.usuario.email, 'test@mail.com');
  assert.equal(r.body.usuario.rol, 'estudiante');
  assert.equal(r.body.usuario.password_hash, undefined);
  r = await api('POST', '/auth/register', { nombre: 'Otro', email: 'test@mail.com', password: 'clave1234' });
  assert.equal(r.status, 409);
});

test('login: credenciales inválidas y sesión', async () => {
  assert.equal((await api('POST', '/auth/login', { email: 'test@mail.com', password: 'mal12345' })).status, 401);
  assert.equal((await api('POST', '/auth/login', { email: 'noexiste@mail.com', password: 'mal12345' })).status, 401);
  const token = await login('test@mail.com', 'clave1234');
  const me = await api('GET', '/auth/me', null, token);
  assert.equal(me.body.usuario.nombre, 'Test User');
  assert.equal((await api('GET', '/auth/me')).status, 401);
  assert.equal((await api('GET', '/auth/me', null, 'token.falso.x')).status, 401);
});

test('recuperar y restablecer contraseña', async () => {
  const f = await api('POST', '/auth/forgot', { email: 'test@mail.com' });
  assert.equal(f.status, 200);
  assert.match(f.body.codigoDemo, /^\d{6}$/);
  const viejo = await login('test@mail.com', 'clave1234');
  assert.equal((await api('POST', '/auth/reset', { email: 'test@mail.com', codigo: '000000', password: 'nueva1234' })).status, 400);
  const r = await api('POST', '/auth/reset', { email: 'test@mail.com', codigo: f.body.codigoDemo, password: 'nueva1234' });
  assert.equal(r.status, 200);
  assert.ok(r.body.token);
  // El token anterior queda invalidado.
  assert.equal((await api('GET', '/auth/me', null, viejo)).status, 401);
  assert.ok(await login('test@mail.com', 'nueva1234'));
  // Email inexistente: misma respuesta genérica.
  const n = await api('POST', '/auth/forgot', { email: 'nadie@mail.com' });
  assert.equal(n.status, 200);
  assert.equal(n.body.codigoDemo, undefined);
});

test('ejercicios, validación en servidor y XP', async () => {
  const token = await login('alumno@blendgo.app', 'Alumno123!');
  const lista = await api('GET', '/ejercicios', null, token);
  assert.equal(lista.body.length, 12);
  const ej = lista.body.find((e) => e.titulo === 'Primer paso en X');
  let v = await api('POST', `/ejercicios/${ej.id}/validar`, { estado: { position: [1, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] } }, token);
  assert.equal(v.body.correcto, false);
  assert.ok(v.body.pistas[0].includes('Posición X'));
  v = await api('POST', `/ejercicios/${ej.id}/validar`, { estado: { position: [2.05, 0, 0], rotation: [360, 0, 0], scale: [1, 1, 1] } }, token);
  assert.equal(v.body.correcto, true);
  assert.equal(v.body.xpGanada, 50);
  assert.equal(v.body.usuario.xp, 50);
  assert.ok(v.body.insigniasNuevas.some((i) => i.codigo === 'PRIMER_EJERCICIO'));
  // No se puede sumar XP dos veces.
  v = await api('POST', `/ejercicios/${ej.id}/validar`, { estado: { position: [2, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] } }, token);
  assert.equal(v.body.xpGanada, 0);
  assert.equal(v.body.yaCompletado, true);
  const s = await api('GET', '/me/estadisticas', null, token);
  assert.equal(s.body.ejerciciosCompletados, 1);
  assert.equal(s.body.rachaActual, 1);
  assert.equal((await api('GET', '/ejercicios/99999', null, token)).status, 404);
});

test('roles: permisos controlados en el backend', async () => {
  const alumno = await login('alumno@blendgo.app', 'Alumno123!');
  const profe = await login('profe@blendgo.app', 'Profe123!');
  const admin = await login('admin@blendgo.app', 'Admin123!');
  const nuevo = { idCategoria: 1, titulo: 'Ejercicio test', descripcion: 'Mové el cubo a Z = 4 unidades', dificultad: 'Fácil', xpRecompensa: 40, estadoObjetivo: { position: [0, 0, 4], rotation: [0, 0, 0], scale: [1, 1, 1] } };
  assert.equal((await api('POST', '/ejercicios', nuevo, alumno)).status, 403);
  assert.equal((await api('POST', '/ejercicios', { ...nuevo, titulo: '' }, profe)).status, 400);
  const c = await api('POST', '/ejercicios', nuevo, profe);
  assert.equal(c.status, 201);
  // El alumno recibe la notificación del nuevo ejercicio.
  const n = await api('GET', '/notificaciones', null, alumno);
  assert.ok(n.body.items.some((i) => i.tipo === 'ejercicio'));
  const upd = await api('PUT', `/ejercicios/${c.body.id}`, { ...nuevo, titulo: 'Ejercicio editado' }, profe);
  assert.equal(upd.body.titulo, 'Ejercicio editado');
  assert.equal((await api('DELETE', `/ejercicios/${c.body.id}`, null, alumno)).status, 403);
  assert.equal((await api('GET', '/admin/usuarios', null, profe)).status, 403);
  assert.equal((await api('DELETE', `/ejercicios/${c.body.id}`, null, profe)).status, 200);
  const users = await api('GET', '/admin/usuarios', null, admin);
  const t = users.body.find((u) => u.email === 'test@mail.com');
  const rol = await api('PATCH', `/admin/usuarios/${t.id}/rol`, { rol: 'profesor' }, admin);
  assert.equal(rol.body.usuario.rol, 'profesor');
  const cat = await api('POST', '/categorias', { nombre: 'Pivotes', descripcion: 'Centro de transformación' }, profe);
  assert.equal(cat.status, 201);
  assert.equal((await api('DELETE', `/categorias/${cat.body.id}`, null, profe)).status, 403);
  assert.equal((await api('DELETE', `/categorias/${cat.body.id}`, null, admin)).status, 200);
});

test('interacción: comentarios, respuestas y valoraciones', async () => {
  const alumno = await login('alumno@blendgo.app', 'Alumno123!');
  const profe = await login('profe@blendgo.app', 'Profe123!');
  const c = await api('POST', '/ejercicios/1/comentarios', { texto: '¿Cuál es el eje X?' }, alumno);
  assert.equal(c.status, 201);
  await api('POST', '/ejercicios/1/comentarios', { texto: 'El horizontal, en rojo.', idPadre: c.body.id }, profe);
  const lista = await api('GET', '/ejercicios/1/comentarios', null, alumno);
  assert.equal(lista.body[0].respuestas.length, 1);
  const notifs = await api('GET', '/notificaciones', null, alumno);
  assert.ok(notifs.body.items.some((i) => i.titulo.includes('respondieron')));
  const v = await api('PUT', '/ejercicios/1/valoracion', { puntaje: 4 }, alumno);
  assert.equal(v.body.valoracionPromedio, 4);
  assert.equal((await api('PUT', '/ejercicios/1/valoracion', { puntaje: 9 }, alumno)).status, 400);
  const rank = await api('GET', '/ranking', null, alumno);
  assert.equal(rank.body[0].nombre, 'Alumno Leo');
});

test('tutor IA (modo local) con function calling simulado', async () => {
  const token = await login('alumno@blendgo.app', 'Alumno123!');
  let r = await api('POST', '/ia/chat', { mensaje: 'Giralo 45 grados en X', estado: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] } }, token);
  assert.equal(r.body.acciones[0].action, 'rotate');
  assert.deepEqual(r.body.estado.rotation, [45, 0, 0]);
  r = await api('POST', '/ia/chat', { mensaje: 'escalalo al doble', estado: r.body.estado }, token);
  assert.deepEqual(r.body.estado.scale, [2, 2, 2]);
  r = await api('POST', '/ia/chat', { mensaje: 'reiniciá la vista', estado: r.body.estado }, token);
  assert.equal(r.body.acciones[0].tipo, 'resetViewport');
  r = await api('POST', '/ia/chat', { mensaje: '¿cuánta xp tengo?' }, token);
  assert.match(r.body.respuesta, /50 XP/);
});

test('cuenta: editar perfil, cambiar contraseña y tareas programadas', async () => {
  const token = await login('alumno@blendgo.app', 'Alumno123!');
  const p = await api('PATCH', '/me', { nombre: 'Leo Modelador', tema: 'dark' }, token);
  assert.equal(p.body.usuario.nombre, 'Leo Modelador');
  assert.equal((await api('PATCH', '/me', { avatar: 'javascript:alert(1)' }, token)).status, 400);
  assert.equal((await api('POST', '/me/password', { actual: 'mala', nueva: 'Otra12345' }, token)).status, 400);
  const c = await api('POST', '/me/password', { actual: 'Alumno123!', nueva: 'Otra12345' }, token);
  assert.ok(c.body.token);
  assert.equal((await api('GET', '/auth/me', null, token)).status, 401);
  assert.equal((await api('POST', '/tareas/limpieza')).status, 401);
  const r = await fetch(base + '/tareas/recordatorio-racha', { method: 'POST', headers: { 'x-cron-secret': 'secreto-test' } });
  assert.equal(r.status, 200);
});

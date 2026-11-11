// Conexión a SQLite mediante libSQL.
// - En desarrollo usa un archivo local (file:./data/blendgo.db).
// - En producción (Render) se recomienda Turso (SQLite gestionado, gratis) porque
//   el disco de Render free se borra en cada reinicio/deploy.
import { createClient } from '@libsql/client';
import fs from 'node:fs';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import { config } from './config.js';

if (config.dbUrl.startsWith('file:')) {
  const filePath = config.dbUrl.replace(/^file:/, '');
  fs.mkdirSync(path.dirname(path.resolve(filePath)), { recursive: true });
}

export const db = createClient({
  url: config.dbUrl,
  authToken: config.dbAuthToken || undefined,
});

/** Ejecuta una consulta y devuelve todas las filas como objetos planos. */
export async function all(sql, args = []) {
  const r = await db.execute({ sql, args });
  return r.rows.map((row) => ({ ...row }));
}
/** Devuelve la primera fila o null. */
export async function get(sql, args = []) {
  const rows = await all(sql, args);
  return rows[0] ?? null;
}
/** Ejecuta un INSERT/UPDATE/DELETE. Devuelve { lastId, changes }. */
export async function run(sql, args = []) {
  const r = await db.execute({ sql, args });
  return { lastId: r.lastInsertRowid != null ? Number(r.lastInsertRowid) : null, changes: r.rowsAffected };
}

// Esquema. Se corrigió la sintaxis del borrador original
// ("INTEGER FOREIGN KEY REFERENCES" no es válido en SQLite → "INTEGER REFERENCES").
// Roles: 'usuario' (cualquiera: hace ejercicios y aporta los suyos, como en GitHub)
// y 'superadmin' (además modera: puede borrar contenido de otros y gestionar usuarios).
const COLUMNAS_USUARIO = `
    id_usuario INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT,
    google_id TEXT UNIQUE,
    rol TEXT NOT NULL DEFAULT 'usuario' CHECK(rol IN ('usuario','superadmin')),
    nivel INTEGER DEFAULT 1,
    xp_total INTEGER DEFAULT 0,
    avatar TEXT,
    tema TEXT DEFAULT 'system' CHECK(tema IN ('system','light','dark')),
    notif_activas INTEGER DEFAULT 1,
    racha_actual INTEGER DEFAULT 0,
    racha_maxima INTEGER DEFAULT 0,
    ultima_actividad TEXT,
    token_version INTEGER DEFAULT 0,
    creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP`;

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS USUARIO (${COLUMNAS_USUARIO}
  )`,
  `CREATE TABLE IF NOT EXISTS CATEGORIA (
    id_categoria INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL UNIQUE,
    descripcion TEXT,
    icono TEXT DEFAULT 'cube-outline'
  )`,
  `CREATE TABLE IF NOT EXISTS EJERCICIO (
    id_ejercicio INTEGER PRIMARY KEY AUTOINCREMENT,
    id_categoria INTEGER NOT NULL REFERENCES CATEGORIA(id_categoria) ON DELETE CASCADE,
    titulo TEXT NOT NULL,
    descripcion TEXT NOT NULL,
    dificultad TEXT NOT NULL CHECK(dificultad IN ('Fácil','Medio','Avanzado')),
    xp_recompensa INTEGER DEFAULT 50,
    estado_inicial_json TEXT NOT NULL,
    estado_objetivo_json TEXT NOT NULL,
    creado_por INTEGER REFERENCES USUARIO(id_usuario) ON DELETE SET NULL,
    creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS PROGRESO_USUARIO (
    id_progreso INTEGER PRIMARY KEY AUTOINCREMENT,
    id_usuario INTEGER NOT NULL REFERENCES USUARIO(id_usuario) ON DELETE CASCADE,
    id_ejercicio INTEGER NOT NULL REFERENCES EJERCICIO(id_ejercicio) ON DELETE CASCADE,
    completado BOOLEAN DEFAULT 0,
    intentos INTEGER DEFAULT 0,
    completado_en TIMESTAMP,
    ultimo_intento TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(id_usuario, id_ejercicio)
  )`,
  `CREATE TABLE IF NOT EXISTS COMENTARIO (
    id_comentario INTEGER PRIMARY KEY AUTOINCREMENT,
    id_ejercicio INTEGER NOT NULL REFERENCES EJERCICIO(id_ejercicio) ON DELETE CASCADE,
    id_usuario INTEGER NOT NULL REFERENCES USUARIO(id_usuario) ON DELETE CASCADE,
    id_padre INTEGER REFERENCES COMENTARIO(id_comentario) ON DELETE CASCADE,
    texto TEXT NOT NULL,
    creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS VALORACION (
    id_usuario INTEGER NOT NULL REFERENCES USUARIO(id_usuario) ON DELETE CASCADE,
    id_ejercicio INTEGER NOT NULL REFERENCES EJERCICIO(id_ejercicio) ON DELETE CASCADE,
    puntaje INTEGER NOT NULL CHECK(puntaje BETWEEN 1 AND 5),
    creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id_usuario, id_ejercicio)
  )`,
  `CREATE TABLE IF NOT EXISTS NOTIFICACION (
    id_notificacion INTEGER PRIMARY KEY AUTOINCREMENT,
    id_usuario INTEGER NOT NULL REFERENCES USUARIO(id_usuario) ON DELETE CASCADE,
    titulo TEXT NOT NULL,
    cuerpo TEXT NOT NULL,
    tipo TEXT NOT NULL DEFAULT 'general',
    data_json TEXT,
    leida INTEGER DEFAULT 0,
    creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS PUSH_TOKEN (
    token TEXT PRIMARY KEY,
    id_usuario INTEGER NOT NULL REFERENCES USUARIO(id_usuario) ON DELETE CASCADE,
    plataforma TEXT,
    creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS RESET_PASSWORD (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    id_usuario INTEGER NOT NULL REFERENCES USUARIO(id_usuario) ON DELETE CASCADE,
    codigo_hash TEXT NOT NULL,
    expira_en INTEGER NOT NULL,
    intentos INTEGER DEFAULT 0,
    usado INTEGER DEFAULT 0
  )`,
  // Interacción entre usuarios: saludos/reacciones prefijados (emoji + mensaje corto).
  `CREATE TABLE IF NOT EXISTS SALUDO (
    id_saludo INTEGER PRIMARY KEY AUTOINCREMENT,
    id_de INTEGER NOT NULL REFERENCES USUARIO(id_usuario) ON DELETE CASCADE,
    id_para INTEGER NOT NULL REFERENCES USUARIO(id_usuario) ON DELETE CASCADE,
    codigo TEXT NOT NULL,
    creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS INSIGNIA (
    id_insignia INTEGER PRIMARY KEY AUTOINCREMENT,
    codigo TEXT UNIQUE NOT NULL,
    nombre TEXT NOT NULL,
    descripcion TEXT NOT NULL,
    icono TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS USUARIO_INSIGNIA (
    id_usuario INTEGER NOT NULL REFERENCES USUARIO(id_usuario) ON DELETE CASCADE,
    id_insignia INTEGER NOT NULL REFERENCES INSIGNIA(id_insignia) ON DELETE CASCADE,
    obtenida_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id_usuario, id_insignia)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_progreso_usuario ON PROGRESO_USUARIO(id_usuario)`,
  `CREATE INDEX IF NOT EXISTS idx_comentario_ej ON COMENTARIO(id_ejercicio)`,
  `CREATE INDEX IF NOT EXISTS idx_notif_usuario ON NOTIFICACION(id_usuario, leida)`,
  `CREATE INDEX IF NOT EXISTS idx_saludo_para ON SALUDO(id_para, creado_en)`,
  `CREATE INDEX IF NOT EXISTS idx_saludo_de ON SALUDO(id_de, id_para, creado_en)`,
];

const S = (p, r, s) => JSON.stringify({ position: p, rotation: r, scale: s });
const ORIGEN = S([0, 0, 0], [0, 0, 0], [1, 1, 1]);

const CATEGORIAS = [
  ['Traslación', 'Mové objetos en el espacio sobre los ejes X, Y y Z.', 'move-outline'],
  ['Rotación', 'Girá objetos alrededor de cada eje, en grados.', 'refresh-outline'],
  ['Escalado', 'Cambiá el tamaño de un objeto, uniforme o por eje.', 'resize-outline'],
  ['Combinado (TRS)', 'Desafíos que mezclan traslación, rotación y escalado.', 'cube-outline'],
];

// [categoria, titulo, descripcion, dificultad, xp, inicial, objetivo]
const EJERCICIOS = [
  [1, 'Primer paso en X', 'Mové el cubo 2 unidades hacia la derecha sobre el eje X.', 'Fácil', 50, ORIGEN, S([2, 0, 0], [0, 0, 0], [1, 1, 1])],
  [1, 'Elevación', 'Subí el cubo 3 unidades en el eje Y (arriba).', 'Fácil', 50, ORIGEN, S([0, 3, 0], [0, 0, 0], [1, 1, 1])],
  [1, 'Diagonal en el piso', 'Llevá el cubo a X = -2 y Z = 2 sin despegarlo del piso.', 'Medio', 75, ORIGEN, S([-2, 0, 2], [0, 0, 0], [1, 1, 1])],
  [2, 'Cuarto de vuelta', 'Rotá el cubo 90° sobre el eje Y.', 'Fácil', 50, ORIGEN, S([0, 0, 0], [0, 90, 0], [1, 1, 1])],
  [2, 'Inclinación', 'Inclinalo 45° en X y 45° en Z.', 'Medio', 75, ORIGEN, S([0, 0, 0], [45, 0, 45], [1, 1, 1])],
  [2, 'Volver a cero', 'El cubo arranca rotado. Dejalo con rotación (0, 0, 0).', 'Fácil', 50, S([0, 0, 0], [30, 60, 0], [1, 1, 1]), ORIGEN],
  [3, 'Doble tamaño', 'Escalá el cubo al doble de forma uniforme (2, 2, 2).', 'Fácil', 50, ORIGEN, S([0, 0, 0], [0, 0, 0], [2, 2, 2])],
  [3, 'Columna', 'Convertí el cubo en una columna: escala Y = 3, X y Z = 0.5.', 'Medio', 75, ORIGEN, S([0, 0, 0], [0, 0, 0], [0.5, 3, 0.5])],
  [3, 'Losa', 'Hacé una losa plana: X = 3, Y = 0.2, Z = 3.', 'Medio', 75, ORIGEN, S([0, 0, 0], [0, 0, 0], [3, 0.2, 3])],
  [4, 'Mesa de estudio', 'Posición (0, 1, 0), escala (2, 0.2, 1) y rotación Y 30°.', 'Avanzado', 120, ORIGEN, S([0, 1, 0], [0, 30, 0], [2, 0.2, 1])],
  [4, 'Cubo flotante', 'Posición (1, 2, -1), rotación (45, 45, 0), escala 0.5 uniforme.', 'Avanzado', 120, ORIGEN, S([1, 2, -1], [45, 45, 0], [0.5, 0.5, 0.5])],
  [4, 'Rescate', 'El cubo está perdido. Devolvelo al origen con escala 1 y sin rotación.', 'Medio', 90, S([3, -1, 2], [0, 135, 20], [1.5, 0.5, 1]), ORIGEN],
];

export const INSIGNIAS = [
  ['PRIMER_EJERCICIO', 'Primer vértice', 'Completaste tu primer ejercicio.', 'sparkles-outline'],
  ['CINCO_EJERCICIOS', 'Manos a la malla', 'Completaste 5 ejercicios.', 'layers-outline'],
  ['CATEGORIA_COMPLETA', 'Dominio total', 'Completaste todos los ejercicios de una categoría.', 'trophy-outline'],
  ['RACHA_3', 'En racha', 'Practicaste 3 días seguidos.', 'flame-outline'],
  ['RACHA_7', 'Imparable', 'Practicaste 7 días seguidos.', 'rocket-outline'],
  ['NIVEL_5', 'Modelador Junior', 'Alcanzaste el nivel 5.', 'ribbon-outline'],
  ['AVANZADO', 'Sin miedo', 'Completaste un ejercicio Avanzado.', 'flash-outline'],
];

/**
 * Migración de roles (estudiante/profesor/admin → usuario/superadmin).
 * SQLite no permite cambiar un CHECK, así que se reconstruye la tabla USUARIO con el
 * procedimiento oficial (crear nueva → copiar → borrar vieja → renombrar). migrate()
 * de libSQL lo ejecuta en una transacción con las foreign keys apagadas, así no se
 * borra en cascada el progreso, los comentarios ni nada de lo que referencia al usuario.
 * Si algo falla, se revierte todo.
 */
async function migrarRoles() {
  const t = await get("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'USUARIO'");
  if (!t || !String(t.sql).includes("'profesor'")) return;
  const columnas = 'id_usuario, nombre, email, password_hash, google_id, rol, nivel, xp_total, avatar, tema, notif_activas, racha_actual, racha_maxima, ultima_actividad, token_version, creado_en';
  await db.migrate([
    `CREATE TABLE USUARIO_nuevo (${COLUMNAS_USUARIO}\n  )`,
    `INSERT INTO USUARIO_nuevo (${columnas})
       SELECT ${columnas.replace('rol,', "CASE WHEN rol = 'admin' THEN 'superadmin' ELSE 'usuario' END,")} FROM USUARIO`,
    'DROP TABLE USUARIO',
    'ALTER TABLE USUARIO_nuevo RENAME TO USUARIO',
  ]);
  console.log('[db] Migración de roles aplicada: admin → superadmin; estudiante/profesor → usuario.');
}

export async function initDb() {
  if (config.dbUrl.startsWith('file:')) await db.execute('PRAGMA foreign_keys = ON');
  for (const stmt of SCHEMA) await db.execute(stmt);
  await migrarRoles();

  for (const [codigo, nombre, descripcion, icono] of INSIGNIAS) {
    await run('INSERT OR IGNORE INTO INSIGNIA (codigo, nombre, descripcion, icono) VALUES (?,?,?,?)', [codigo, nombre, descripcion, icono]);
  }

  const { n } = await get('SELECT COUNT(*) AS n FROM USUARIO');
  if (Number(n) === 0 && config.seedDemo) await seed();
}

async function seed() {
  const users = [
    ['Admin BlendGO', 'admin@blendgo.app', 'Admin123!', 'superadmin'],
    ['Ana Modeladora', 'profe@blendgo.app', 'Profe123!', 'usuario'],
    ['Leo Vértice', 'alumno@blendgo.app', 'Alumno123!', 'usuario'],
  ];
  for (const [nombre, email, pass, rol] of users) {
    await run('INSERT INTO USUARIO (nombre, email, password_hash, rol) VALUES (?,?,?,?)', [nombre, email, bcrypt.hashSync(pass, 10), rol]);
  }
  const profe = await get('SELECT id_usuario FROM USUARIO WHERE email = ?', ['profe@blendgo.app']);
  for (const [nombre, descripcion, icono] of CATEGORIAS) {
    await run('INSERT INTO CATEGORIA (nombre, descripcion, icono) VALUES (?,?,?)', [nombre, descripcion, icono]);
  }
  for (const [cat, titulo, desc, dif, xp, ini, obj] of EJERCICIOS) {
    await run(
      `INSERT INTO EJERCICIO (id_categoria, titulo, descripcion, dificultad, xp_recompensa, estado_inicial_json, estado_objetivo_json, creado_por)
       VALUES (?,?,?,?,?,?,?,?)`,
      [cat, titulo, desc, dif, xp, ini, obj, profe.id_usuario]
    );
  }
  console.log('[db] Datos de demostración cargados (superadmin + 2 usuarios).');
}

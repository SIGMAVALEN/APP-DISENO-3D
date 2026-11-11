// La migración de roles reconstruye USUARIO sin perder datos relacionados.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createClient } from '@libsql/client';

test('migración estudiante/profesor/admin → usuario/superadmin', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'blendgo-mig-'));
  const url = `file:${path.join(tmp, 'vieja.db')}`;
  // Base con el esquema VIEJO y datos que referencian a los usuarios.
  const vieja = createClient({ url });
  await vieja.execute('PRAGMA foreign_keys = ON');
  await vieja.batch([
    `CREATE TABLE USUARIO (id_usuario INTEGER PRIMARY KEY AUTOINCREMENT, nombre TEXT NOT NULL, email TEXT UNIQUE NOT NULL,
      password_hash TEXT, google_id TEXT UNIQUE, rol TEXT NOT NULL DEFAULT 'estudiante' CHECK(rol IN ('estudiante','profesor','admin')),
      nivel INTEGER DEFAULT 1, xp_total INTEGER DEFAULT 0, avatar TEXT, tema TEXT DEFAULT 'system' CHECK(tema IN ('system','light','dark')),
      notif_activas INTEGER DEFAULT 1, racha_actual INTEGER DEFAULT 0, racha_maxima INTEGER DEFAULT 0, ultima_actividad TEXT,
      token_version INTEGER DEFAULT 0, creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`,
    `CREATE TABLE CATEGORIA (id_categoria INTEGER PRIMARY KEY AUTOINCREMENT, nombre TEXT NOT NULL UNIQUE, descripcion TEXT, icono TEXT)`,
    `CREATE TABLE EJERCICIO (id_ejercicio INTEGER PRIMARY KEY AUTOINCREMENT, id_categoria INTEGER NOT NULL REFERENCES CATEGORIA(id_categoria) ON DELETE CASCADE,
      titulo TEXT NOT NULL, descripcion TEXT NOT NULL, dificultad TEXT NOT NULL, xp_recompensa INTEGER DEFAULT 50,
      estado_inicial_json TEXT NOT NULL, estado_objetivo_json TEXT NOT NULL, creado_por INTEGER REFERENCES USUARIO(id_usuario) ON DELETE SET NULL,
      creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`,
    `CREATE TABLE PROGRESO_USUARIO (id_progreso INTEGER PRIMARY KEY AUTOINCREMENT, id_usuario INTEGER NOT NULL REFERENCES USUARIO(id_usuario) ON DELETE CASCADE,
      id_ejercicio INTEGER NOT NULL REFERENCES EJERCICIO(id_ejercicio) ON DELETE CASCADE, completado BOOLEAN DEFAULT 0, intentos INTEGER DEFAULT 0,
      completado_en TIMESTAMP, ultimo_intento TIMESTAMP DEFAULT CURRENT_TIMESTAMP, UNIQUE(id_usuario, id_ejercicio))`,
    "INSERT INTO USUARIO (nombre, email, rol, xp_total) VALUES ('A','a@x.com','admin',10), ('P','p@x.com','profesor',20), ('E','e@x.com','estudiante',30)",
    "INSERT INTO CATEGORIA (nombre) VALUES ('Cat')",
    "INSERT INTO EJERCICIO (id_categoria, titulo, descripcion, dificultad, estado_inicial_json, estado_objetivo_json, creado_por) VALUES (1,'T','D','Fácil','{}','{}',2)",
    'INSERT INTO PROGRESO_USUARIO (id_usuario, id_ejercicio, completado) VALUES (3, 1, 1)',
  ], 'write');
  vieja.close();

  process.env.DATABASE_URL = url;
  process.env.SEED_DEMO = 'false';
  const { initDb, all } = await import('../src/db.js');
  await initDb();
  await initDb(); // idempotente: la segunda vez no hace nada

  const users = await all('SELECT email, rol, xp_total FROM USUARIO ORDER BY id_usuario');
  assert.deepEqual(users.map((u) => [u.email, u.rol, Number(u.xp_total)]), [['a@x.com', 'superadmin', 10], ['p@x.com', 'usuario', 20], ['e@x.com', 'usuario', 30]]);
  // No se perdió nada de lo que referenciaba a los usuarios.
  assert.equal(Number((await all('SELECT creado_por FROM EJERCICIO'))[0].creado_por), 2);
  assert.equal((await all('SELECT * FROM PROGRESO_USUARIO')).length, 1);
  const fk = await all('PRAGMA foreign_key_check');
  assert.equal(fk.length, 0);
  // El esquema nuevo rechaza los roles viejos.
  await assert.rejects(all("UPDATE USUARIO SET rol = 'profesor' WHERE id_usuario = 1"));
});

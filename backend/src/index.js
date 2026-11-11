import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { initDb, get } from './db.js';
import { errorHandler, HttpError } from './lib/http.js';
import authRoutes from './routes/auth.js';
import catalogoRoutes from './routes/catalogo.js';
import usuariosRoutes from './routes/usuarios.js';
import { iniciarJobs, TAREAS } from './services/jobs.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function crearApp() {
  const app = express();
  app.set('trust proxy', 1); // Render está detrás de un proxy (necesario para rate-limit)
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          imgSrc: ["'self'", 'data:', 'https://api.qrserver.com'],
          styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
          fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        },
      },
    })
  );
  app.use(cors({ origin: config.corsOrigins.includes('*') ? true : config.corsOrigins }));
  app.use(express.json({ limit: '600kb' }));

  // Salud del servicio (también sirve para "despertar" Render).
  app.get('/api/health', async (_req, res) => {
    await get('SELECT 1 AS ok');
    res.json({ ok: true, ia: config.geminiApiKey ? 'gemini' : 'local', hora: new Date().toISOString() });
  });

  // Información pública para la web del proyecto.
  app.get('/api/public/info', async (_req, res) => {
    const u = await get('SELECT COUNT(*) AS n FROM USUARIO');
    const e = await get('SELECT COUNT(*) AS n FROM EJERCICIO');
    res.json({ apkUrl: config.apkUrl, expoUrl: config.expoUrl, usuarios: Number(u.n), ejercicios: Number(e.n), googleLogin: config.googleClientIds.length > 0 });
  });

  // Tareas en segundo plano disparables desde un cron externo.
  app.post('/api/tareas/:nombre', async (req, res) => {
    if (!config.cronSecret || req.headers['x-cron-secret'] !== config.cronSecret) throw new HttpError(401, 'No autorizado');
    const tarea = TAREAS[req.params.nombre];
    if (!tarea) throw new HttpError(404, 'Tarea inexistente');
    res.json({ ok: true, resultado: await tarea() });
  });

  app.use('/api/auth', authRoutes);
  app.use('/api', catalogoRoutes);
  app.use('/api', usuariosRoutes);
  app.use('/api', (_req, _res, next) => next(new HttpError(404, 'Ruta no encontrada')));

  // Sitio web público del proyecto (requisito 8), servido por el mismo backend.
  app.use(express.static(path.join(__dirname, '..', 'public'), { extensions: ['html'] }));

  app.use(errorHandler);
  return app;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await initDb();
  crearApp().listen(config.port, () => {
    console.log(`[api] BlendGO! escuchando en http://localhost:${config.port}`);
    console.log(`[api] Base de datos: ${config.dbUrl.startsWith('file:') ? config.dbUrl : 'Turso (remota)'} | IA: ${config.geminiApiKey ? config.geminiModel : 'modo local'}`);
  });
  iniciarJobs();
}

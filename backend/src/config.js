import 'dotenv/config';

const isProd = process.env.NODE_ENV === 'production';

if (isProd && !process.env.JWT_SECRET) {
  console.error('[config] Falta JWT_SECRET en producción. Abortando.');
  process.exit(1);
}

export const config = {
  isProd,
  port: Number(process.env.PORT) || 3000,
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-cambiar-en-produccion',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '30d',

  // Base de datos: Turso (libsql://...) en producción o archivo local en desarrollo.
  dbUrl: process.env.TURSO_DATABASE_URL || process.env.DATABASE_URL || 'file:./data/blendgo.db',
  dbAuthToken: process.env.TURSO_AUTH_TOKEN || '',
  seedDemo: process.env.SEED_DEMO !== 'false',

  // IA
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  geminiModel: process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite',

  // Social login (IDs de cliente OAuth de Google separados por coma: web, android, ios)
  googleClientIds: (process.env.GOOGLE_CLIENT_IDS || '').split(',').map((s) => s.trim()).filter(Boolean),

  // Email (Render free bloquea SMTP → se usa la API HTTP de Brevo o Resend)
  brevoApiKey: process.env.BREVO_API_KEY || '',
  resendApiKey: process.env.RESEND_API_KEY || '',
  mailFrom: process.env.MAIL_FROM || 'BlendGO! <no-reply@blendgo.app>',
  // Solo para demos sin servicio de email: devuelve el código en la respuesta. NUNCA en producción real.
  demoShowResetCode: process.env.DEMO_SHOW_RESET_CODE === 'true',

  // Push (opcional, mejora límites de la API de Expo)
  expoAccessToken: process.env.EXPO_ACCESS_TOKEN || '',

  // Tareas programadas disparadas desde afuera (cron-job.org, GitHub Actions)
  cronSecret: process.env.CRON_SECRET || '',

  // Distribución, mostrado en la web pública
  apkUrl: process.env.APK_URL || '',
  expoUrl: process.env.EXPO_URL || '',
  corsOrigins: (process.env.CORS_ORIGINS || '*').split(',').map((s) => s.trim()),
};

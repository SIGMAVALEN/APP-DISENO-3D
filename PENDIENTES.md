# BlendGO! — Cómo correrlo en una PC nueva y qué falta

## A. Correrlo en una PC nueva

### Requisitos
- **Node 20 o más nuevo** (`node -v`). En Ubuntu conviene instalarlo con nvm, porque el npm que trae `apt` (9.x) es viejo y deja instalaciones a medias si se corta la red:
  ```bash
  curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
  # cerrar y abrir la terminal
  nvm install 22
  ```
- Git.

### 1. Instalar dependencias (en las dos carpetas)
```bash
cd backend
npm install --no-audit --no-fund --fetch-timeout=600000 --fetch-retries=5

cd ../mobile
npm install --no-audit --no-fund --fetch-timeout=600000 --fetch-retries=5 --maxsockets=4
```
Si se corta: `rm -rf node_modules` y repetir el mismo comando. **No borrar `package-lock.json`.**

### 2. Crear los `.env` (no se suben a GitHub)
```bash
cp backend/.env.example backend/.env
cp mobile/.env.example mobile/.env
```
- `backend/.env`: para probar en local se puede dejar como viene. Si querés la IA, poné `GEMINI_API_KEY`.
- `mobile/.env`, según contra qué backend quieras probar:
  - el de Render (recomendado, anda desde cualquier lado): `EXPO_PUBLIC_API_URL=https://TU-SERVICIO.onrender.com`
  - el local, desde el navegador de la PC: `EXPO_PUBLIC_API_URL=http://localhost:3000`
  - el local, desde Expo Go en el celular: `EXPO_PUBLIC_API_URL=http://IP-DE-LA-PC:3000` (la ves con `hostname -I`; celular y PC en el mismo wifi)

### 3. Levantar
```bash
# Solo si usás el backend local
cd backend && npm run dev            # → "[api] BlendGO! escuchando en http://localhost:3000"

# La app
cd mobile
npx expo start -c                    # QR para Expo Go
npx expo start --web -c              # en el navegador
npx expo start --tunnel -c           # Expo Go desde otra red
```
Después de cambiar un `.env`, siempre reiniciar con `-c`.

### 4. Herramienta de EAS (para el APK)
```bash
npm install -g eas-cli        # en Ubuntu con el npm de apt: sudo npm install -g eas-cli
eas login
```
Los comandos `eas` se corren **dentro de `mobile/`**.

### Qué no anda en Expo Go (es normal)
- Login con Google: el botón se oculta.
- Notificaciones push: la app no carga `expo-notifications` en Expo Go.

Las dos cosas funcionan en el APK.

### Errores que ya vimos
| Error | Solución |
|---|---|
| `ERR_SOCKET_TIMEOUT` en `npm install` | Red lenta: usar los flags del paso 1 y reintentar. |
| `ENOTEMPTY ... rename hermes-compiler` | `rm -rf node_modules` y reinstalar. |
| `ENOENT ... .expo/codesigning` | Cerrar todos los `expo start`, `rm -rf ~/.expo/codesigning`, `npx expo start -c`. |
| `cannot find native module 'ExpoTopicSubscriptionModule'` | Ya está arreglado en esta versión (`src/lib/notifModule.js`). |
| "No hay conexión con el servidor" | `EXPO_PUBLIC_API_URL` mal: IP vieja, `localhost` usado en el celular o Render dormido. Probar `/api/health` desde el navegador del celular. |
| `eas: command not found` | Instalar eas-cli (paso 4) o usar `npx eas-cli@latest ...`. |
| "Run this command inside a project directory" | Correr `eas` dentro de `mobile/`. |
| `npm ci` falla en Render | Root Directory = `backend`. |

---

## B. Pendientes

### Imprescindible para la entrega
- [ ] **Subir esta versión a GitHub.** El repo `APP-DISENO-3D` tenía otra versión (`backend/` + `frontend/`, con `server.js`). Render despliega lo que esté en GitHub.
- [ ] **Render:** Root Directory `backend`, Build `npm install`, Start `npm start`, Health check `/api/health`.
- [ ] **Turso (gratis):** crear la base y cargar `TURSO_DATABASE_URL` y `TURSO_AUTH_TOKEN` en Render. Sin eso, la base de Render se borra en cada reinicio.
- [ ] **Variables en Render:** `NODE_ENV=production`, `JWT_SECRET`, `CRON_SECRET`, `GEMINI_API_KEY`, `GOOGLE_CLIENT_IDS` (ID **Web**).
- [ ] **Comprobar** que `https://TU-SERVICIO.onrender.com/api/health` responde `{"ok":true,...}` (un 404 significa que sigue la versión vieja).
- [ ] **`mobile/eas.json`:** en los perfiles `preview` y `production`, poner tu URL real de Render en `EXPO_PUBLIC_API_URL` y el ID Web de Google en `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`.
- [ ] **`eas init`** dentro de `mobile/` (completa `projectId` en `app.json`) y hacer commit.
- [ ] **Generar el APK:** `eas build -p android --profile preview` (dentro de `mobile/`).
- [ ] **Cargar el link del APK** en `APK_URL` en Render (la web muestra el botón y el QR).
- [ ] **Probar el APK en el celular:** registro, login, ejercicio, IA, cambio de tema.

### Login con Google
- [x] Cliente OAuth **Web** creado.
- [x] Cliente OAuth **Android** creado (paquete `com.blendgo.app` + SHA-1 de `eas credentials -p android`, perfil preview).
- [ ] Pantalla de consentimiento: agregar **Usuarios de prueba** o **Publicar app** (si no, Google bloquea a quien no esté en la lista).
- [ ] ID Web en `GOOGLE_CLIENT_IDS` (Render) y en `eas.json` → nuevo APK.
- [ ] Confirmar `"googleLogin": true` en `https://TU-SERVICIO.onrender.com/api/public/info`.

### Recomendado
- [ ] **Email de recuperación (Brevo, gratis):** verificar remitente, crear API key, cargar `BREVO_API_KEY` y `MAIL_FROM` en Render. Para la demo sin email: `DEMO_SHOW_RESET_CODE=true` (sacarlo después).
- [ ] **Push en el APK:** `eas credentials` → Android → FCM V1 (Google Service Account). Sin esto, el APK usa solo la bandeja de notificaciones de la app y el recordatorio local.
- [ ] **Tareas programadas con Render dormido:** cargar en GitHub (Settings → Secrets) `API_URL` y `CRON_SECRET`.
- [ ] `npx expo install --check` para alinear versiones (era el aviso "7 packages may need updating").
- [ ] Ensayar la defensa con el guion de la sección 5 del README.

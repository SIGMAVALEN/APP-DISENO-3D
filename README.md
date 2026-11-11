# BlendGO! 🧊

Aplicación móvil educativa y gamificada para aprender modelado 3D (Traslación, Rotación y Escalado — TRS) con un tutor IA (Google Gemini con Function Calling).

Proyecto Final · Construcción de Software · 6.º año.

```
blendgo/
├── backend/          API REST (Node + Express + SQLite/libSQL + JWT + Gemini) y web pública (/public)
│   ├── src/          index, config, db, routes/, services/, lib/
│   ├── public/       sitio web del proyecto (lo sirve el mismo backend en "/")
│   └── test/         pruebas de integración (npm test)
├── mobile/           App React Native (Expo SDK 58 + React Navigation)
│   └── src/          screens/, components/, context/, lib/, api/
├── render.yaml       despliegue del backend en Render con un clic
└── .github/workflows/tareas.yml   cron externo para las tareas en segundo plano
```

---

## 1. Cumplimiento de requisitos

| Requisito (PDF) | Cómo se cumple |
|---|---|
| **3.1 Autenticación** | Registro, login, logout, recuperar y restablecer contraseña (código de 6 dígitos por email, vence en 15 min, máx. 5 intentos), sesión persistente, contraseñas con **bcrypt**, **JWT** guardado cifrado con `expo-secure-store`. Al cambiar la contraseña se invalidan los demás tokens (`token_version`). Rate-limit contra fuerza bruta. |
| **Social login** | **Google** (`@react-native-google-signin`, token verificado en el backend con `google-auth-library`). |
| **3.2 Home** | Dashboard con banner de nivel/XP animado, racha, “continuá donde quedaste”, ejercicios por categoría con filtro de dificultad y estado Pendiente/Completado. |
| **3.3 ABM** | Ejercicios (alta/baja/modificación/consulta con vista previa 3D) y Categorías. Usuarios (admin). |
| **3.4 Roles** | `estudiante`, `profesor`, `admin`. Permisos controlados en el **backend** (`requireRole`) — un profesor solo edita sus ejercicios; solo el admin borra categorías y gestiona usuarios. |
| **3.5 Interacción** | Comentarios con respuestas, valoraciones de 1 a 5 estrellas, ranking. Las respuestas notifican al autor. |
| **3.6 Cuenta** | Ver datos, editar nombre y foto, cambiar/crear contraseña, preferencias de tema y notificaciones, cerrar sesión, cerrar en todos los dispositivos, eliminar cuenta. |
| **3.7 Tema** | Claro, oscuro y del sistema; se guarda en el dispositivo y en la cuenta. |
| **3.8 Notificaciones** | Push con Expo Push Service (nuevo ejercicio, respuestas, subida de nivel, insignias, cambio de rol, recordatorio de racha) + bandeja dentro de la app + recordatorio local diario. |
| **3.9 Segundo plano** | Servidor: `node-cron` (recordatorio de racha 19:00, limpieza 03:15) también disparable por GitHub Actions. App: **cola offline** que sincroniza intentos al recuperar la red o volver al primer plano. |
| **3.10 Almacenamiento** | SQLite relacional (archivo local en desarrollo, **Turso** en producción). Fotos de perfil redimensionadas a 256 px y guardadas en la base. |
| **3.11 Validaciones y errores** | Validación en cliente y en servidor (zod) con mensajes por campo, credenciales inválidas, registros inexistentes (404), operaciones no autorizadas (401/403), sin conexión, timeouts, errores 5xx, estados de carga y reintento. |
| **3.12 Seguridad** | Helmet, CORS, rate-limit, JWT con expiración, roles en backend, la XP se calcula **en el servidor** (no se puede hacer trampa), secretos solo en variables de entorno, el tutor IA no deja que un estudiante consulte datos de otros. |
| **7 Distribución** | APK con EAS Build (perfil `preview`). |
| **8 Web pública** | `backend/public` (servida en la raíz del backend): descripción, problema, funciones, público, descarga del APK + QR, instrucciones y usuarios de prueba. |

**Extras (“la vara”)**: tutor IA con Function Calling, visor 3D propio con cámara orbital, insignias, rachas, ranking, modo offline con sincronización, tests automáticos de la API.

### Correcciones al documento de diseño original
- `INTEGER FOREIGN KEY REFERENCES` no es sintaxis válida de SQLite → se usa `INTEGER REFERENCES ... ON DELETE CASCADE`.
- `estado_inicial_json` se usaba como “objetivo”: ahora hay `estado_inicial_json` **y** `estado_objetivo_json`.
- `transformObject` acepta un parámetro opcional `absolute` (“ponelo en X = 3”).
- El visor 3D no usa CSS 3D: es un renderizador propio (proyección + algoritmo del pintor) dibujado con SVG, que funciona en el APK, Expo Go y web.

---

## 2. Usuarios de prueba (se crean solos al iniciar con la base vacía)

| Rol | Email | Contraseña |
|---|---|---|
| Estudiante | alumno@blendgo.app | Alumno123! |
| Profesor | profe@blendgo.app | Profe123! |
| Administrador | admin@blendgo.app | Admin123! |

---

## 3. Correr en local

> Guía completa para una PC nueva, errores conocidos y lista de pendientes: **PENDIENTES.md**.

**Backend**
```bash
cd backend
cp .env.example .env        # completá lo que quieras (todo es opcional en local)
npm install
npm run dev                 # http://localhost:3000  (web pública en la raíz)
npm test                    # 8 pruebas de integración
```
Sin `GEMINI_API_KEY` el tutor usa un intérprete local de órdenes, así la demo nunca falla. Si Gemini falla (cuota, red), también cae a ese modo.

**App**
```bash
cd mobile
npm install
cp .env.example .env        # EXPO_PUBLIC_API_URL=http://IP-DE-TU-PC:3000
npx expo start              # web: tecla "w"
```
> Expo Go para SDK 58 se está publicando en las tiendas; las notificaciones **push remotas** y el login con Google requieren el APK (en Expo Go funcionan las notificaciones locales).

---

## 4. Puesta en producción (todo gratis)

### 4.1 Base de datos — Turso
El disco de Render free se borra en cada reinicio, por eso la base va en Turso (SQLite gestionado):
```bash
# https://turso.tech → crear cuenta → instalar CLI
turso db create blendgo
turso db show blendgo --url          # → TURSO_DATABASE_URL (libsql://...)
turso db tokens create blendgo       # → TURSO_AUTH_TOKEN
```
Las tablas y los usuarios de prueba se crean solos en el primer arranque.

### 4.2 Backend + web — Render
1. Subí este repositorio a GitHub.
2. En Render: **New → Blueprint** y elegí el repo (lee `render.yaml`). `JWT_SECRET` y `CRON_SECRET` se generan solos.
3. Completá en *Environment*: `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `GEMINI_API_KEY` (de [Google AI Studio](https://aistudio.google.com/apikey)) y opcionalmente `BREVO_API_KEY` + `MAIL_FROM`, `GOOGLE_CLIENT_IDS`, `APK_URL`.
4. Verificá `https://TU-SERVICIO.onrender.com/api/health` y la web en `https://TU-SERVICIO.onrender.com/`.

### 4.3 Email de recuperación — Brevo
Render free bloquea los puertos SMTP, así que se usa la API HTTP. En [brevo.com](https://www.brevo.com): crear cuenta → *Senders* → verificar tu email → *SMTP & API* → crear API key → `BREVO_API_KEY`. `MAIL_FROM` debe ser el remitente verificado.
Para una demo sin email podés poner `DEMO_SHOW_RESET_CODE=true` (la app muestra el código) — **no** dejarlo así en uso real.

### 4.4 APK — EAS Build
```bash
cd mobile
npm i -g eas-cli
eas login
eas init                    # completa extra.eas.projectId (necesario para push)
# editá eas.json → EXPO_PUBLIC_API_URL con la URL de Render
eas build -p android --profile preview
```
Al terminar, EAS da un link al `.apk`. Copialo en la variable `APK_URL` de Render: la web muestra el botón de descarga y el QR.

Para push en Android, subí las credenciales FCM: `eas credentials` → Android → *Google Service Account / FCM V1* (guía: docs.expo.dev/push-notifications/fcm-credentials).

### 4.5 Login con Google (opcional pero pedido)
1. [Google Cloud Console](https://console.cloud.google.com) → *APIs y servicios → Credenciales*.
2. Crear un **ID de cliente OAuth tipo Web** → ese ID va en `GOOGLE_CLIENT_IDS` (Render) y en `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` (eas.json).
3. Crear un **ID de cliente tipo Android** con paquete `com.blendgo.app` y la huella SHA-1 que muestra `eas credentials`.
4. Rebuild del APK. El botón “Continuar con Google” aparece solo cuando está configurado.

### 4.6 Tareas programadas con Render dormido
Render free se duerme tras 15 min sin tráfico. El workflow `.github/workflows/tareas.yml` llama a `/api/tareas/...` todos los días. Cargá en GitHub los secrets `API_URL` y `CRON_SECRET` (copiá el valor generado en Render).

---

## 5. Arquitectura (para la defensa)

```
 App (Expo / React Native)                Backend (Render)                     Servicios
 ─────────────────────────                ────────────────                     ─────────
 SecureStore (JWT) ──HTTPS + Bearer──▶  Express  ── requireAuth / requireRole
 AsyncStorage (tema, cola offline)        │  routes/auth.js      ── Google (verifica idToken)
 Visor 3D SVG + controles TRS             │  routes/catalogo.js  ── ABM, validar, comentarios
 Chat IA  ──── POST /api/ia/chat ───────▶ │  routes/usuarios.js  ── cuenta, notifs, IA, admin
     ◀── { respuesta, acciones, estado }  │  services/ai.js      ── Gemini (Function Calling)
 expo-notifications ◀── push ──────────── │  services/notifications.js ── Expo Push Service
                                          │  services/jobs.js    ── node-cron / cron externo
                                          └─ db.js (libSQL) ───────────────▶ Turso (SQLite)
```

**Function Calling, paso a paso**: el usuario escribe “giralo 45 en X” → el backend manda a Gemini el mensaje, el estado 3D actual y la declaración de 3 herramientas → Gemini responde con una llamada `transformObject({action:'rotate', axis:'x', value:45})` → el servidor la aplica sobre una copia del estado y le devuelve el resultado a Gemini (`getUserStats` sí consulta la base) → Gemini redacta la respuesta final → la app recibe `acciones` + `estado` y anima el cubo.

**Validación de ejercicios**: la app envía el estado; el servidor lo compara con el objetivo (tolerancias: 0.15 u, 3°, 0.06), otorga XP una sola vez, recalcula nivel, racha e insignias y genera notificaciones.

**Endpoints principales**: `POST /api/auth/{register,login,google,forgot,reset,logout,logout-all,push-token}`, `GET /api/auth/me`, `GET|POST|PUT|DELETE /api/categorias`, `/api/ejercicios`, `POST /api/ejercicios/:id/validar`, `GET|POST /api/ejercicios/:id/comentarios`, `PUT /api/ejercicios/:id/valoracion`, `GET /api/ranking`, `PATCH|DELETE /api/me`, `POST /api/me/password`, `GET /api/me/estadisticas`, `GET /api/notificaciones`, `POST /api/ia/chat`, `GET /api/admin/*`.

### Guion sugerido para la defensa
1. Abrir la web pública → mostrar descarga e instrucciones.
2. Crear un usuario nuevo en el APK → cerrar sesión → “Olvidé mi contraseña” → código por email → entrar.
3. Hacer “Primer paso en X”: validar mal (pistas) → corregir → +50 XP e insignia.
4. Pedirle a Blendy “giralo 90 en Y” y “¿cuánta XP tengo?”.
5. Entrar como **profe** → Gestión → publicar ejercicio → el alumno recibe la push.
6. Como alumno intentar editar: no aparece; mostrar con curl que el backend responde **403**.
7. Entrar como **admin** → cambiar el rol de un usuario.
8. Modo avión → validar un ejercicio → volver la red → se sincroniza solo.
9. Cambiar a tema claro.

import Constants from 'expo-constants';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';

// URL del backend: EXPO_PUBLIC_API_URL (en eas.json o .env) tiene prioridad sobre app.json.
export const API_URL = (process.env.EXPO_PUBLIC_API_URL || Constants.expoConfig?.extra?.apiUrl || 'http://localhost:3000').replace(/\/$/, '');

// ---------- Almacenamiento seguro del token ----------
// En Android/iOS el JWT se guarda cifrado con expo-secure-store (Keystore/Keychain).
// En web (solo para pruebas) se usa AsyncStorage.
const TOKEN_KEY = 'blendgo_jwt';
export const tokenStorage = {
  get: () => (Platform.OS === 'web' ? AsyncStorage.getItem(TOKEN_KEY) : SecureStore.getItemAsync(TOKEN_KEY)),
  set: (t) => (Platform.OS === 'web' ? AsyncStorage.setItem(TOKEN_KEY, t) : SecureStore.setItemAsync(TOKEN_KEY, t)),
  clear: () => (Platform.OS === 'web' ? AsyncStorage.removeItem(TOKEN_KEY) : SecureStore.deleteItemAsync(TOKEN_KEY)),
};

let tokenActual = null;
let alExpirarSesion = () => {};
export const setToken = (t) => { tokenActual = t; };
export const onSesionExpirada = (fn) => { alExpirarSesion = fn; };

export class ApiError extends Error {
  constructor(message, { status = 0, campos = null, red = false } = {}) {
    super(message);
    this.status = status;
    this.campos = campos;
    this.red = red; // true = problema de conexión (sirve para el modo offline)
  }
}

/**
 * Cliente HTTP con:
 *  - token JWT automático,
 *  - timeout (Render free puede tardar ~50 s en "despertar"),
 *  - mensajes de error claros en español,
 *  - cierre de sesión automático ante 401.
 */
export async function api(path, { method = 'GET', body, timeout = 65000, auth = true } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  let res;
  try {
    res = await fetch(`${API_URL}/api${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(auth && tokenActual ? { Authorization: `Bearer ${tokenActual}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    });
  } catch (e) {
    const msg = e.name === 'AbortError'
      ? 'El servidor tardó demasiado en responder. Probá de nuevo.'
      : 'No hay conexión con el servidor. Revisá tu internet.';
    throw new ApiError(msg, { red: true });
  } finally {
    clearTimeout(timer);
  }

  let data = null;
  try { data = await res.json(); } catch { /* respuesta sin JSON */ }

  if (!res.ok) {
    if (res.status === 401 && auth && tokenActual) alExpirarSesion(data?.error);
    const porDefecto = res.status >= 500 ? 'El servidor tuvo un problema. Intentá más tarde.' : `Error ${res.status}`;
    throw new ApiError(data?.error || porDefecto, { status: res.status, campos: data?.campos || null });
  }
  return data;
}

/** "Despierta" el backend (Render free) sin bloquear la UI. */
export const ping = () => fetch(`${API_URL}/api/health`).then((r) => r.ok).catch(() => false);

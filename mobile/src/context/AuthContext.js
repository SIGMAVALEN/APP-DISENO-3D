import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api, setToken, tokenStorage, onSesionExpirada } from '../api/client';
import { obtenerPushToken, pushTokenGuardado, configurarRecordatorioDiario } from '../lib/notifications';
import { useTheme } from './ThemeContext';
import { googleNativoDisponible } from '../lib/entorno';

// Google Sign-In es un módulo nativo: existe en el APK pero no en Expo Go.
// En Expo Go ni siquiera se importa (evita el error "RNGoogleSignin could not be found").
let GoogleSignin = null;
let isSuccessResponse = null;
let isErrorWithCode = null;
let statusCodes = {};
if (googleNativoDisponible) {
  try {
    const mod = require('@react-native-google-signin/google-signin');
    GoogleSignin = mod.GoogleSignin;
    isSuccessResponse = mod.isSuccessResponse;
    isErrorWithCode = mod.isErrorWithCode;
    statusCodes = mod.statusCodes || {};
  } catch {
    GoogleSignin = null;
  }
}
const GOOGLE_WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || Constants.expoConfig?.extra?.googleWebClientId || '';
let googleConfigurado = false;
/** Devuelve true si Google está listo para usarse (lo configura la primera vez). */
function configurarGoogle() {
  if (!GoogleSignin || Platform.OS === 'web') return false;
  if (googleConfigurado) return true;
  GoogleSignin.configure({ webClientId: GOOGLE_WEB_CLIENT_ID });
  googleConfigurado = true;
  return true;
}

/** Traduce los errores de Google Sign-In a mensajes que dicen qué revisar. */
function mensajeErrorGoogle(e) {
  const code = isErrorWithCode?.(e) ? String(e.code) : String(e?.code ?? '');
  const texto = String(e?.message || '');
  if (code === statusCodes.IN_PROGRESS) return 'Ya hay un inicio de sesión con Google en curso.';
  if (code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) return 'Este celular no tiene Google Play Services actualizado.';
  if (code === '10' || texto.includes('DEVELOPER_ERROR')) {
    return 'Google rechazó la app (DEVELOPER_ERROR). Revisá en Google Cloud que el cliente Android tenga el paquete com.blendgo.app y la SHA-1 de este APK (eas credentials -p android).';
  }
  if (code === '7' || texto.includes('NETWORK_ERROR')) return 'Sin conexión con Google. Revisá tu internet.';
  if (texto.includes('verificar la cuenta de Google')) {
    return 'El servidor no pudo verificar tu cuenta. Revisá que GOOGLE_CLIENT_IDS en Render tenga el mismo ID Web que eas.json.';
  }
  return texto || 'No se pudo iniciar sesión con Google.';
}

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [usuario, setUsuario] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [avisoSesion, setAvisoSesion] = useState(null);
  const { setPreferencia } = useTheme();
  const usuarioRef = useRef(null);
  useEffect(() => { usuarioRef.current = usuario; }, [usuario]);

  const aplicarUsuario = useCallback((u) => {
    setUsuario(u);
    if (u?.tema) setPreferencia(u.tema);
  }, [setPreferencia]);

  const purgarSesion = useCallback(async () => {
    setToken(null);
    setUsuario(null);
    await tokenStorage.clear().catch(() => {});
    // Purga del storage local relacionado con la cuenta.
    await AsyncStorage.multiRemove(['blendgo.colaSync', 'blendgo.chat']).catch(() => {});
    await configurarRecordatorioDiario(false);
  }, []);

  const registrarDispositivo = useCallback(async (u) => {
    const token = await obtenerPushToken();
    if (token) api('/auth/push-token', { method: 'POST', body: { token, plataforma: Platform.OS } }).catch(() => {});
    configurarRecordatorioDiario(u?.notifActivas !== false);
  }, []);

  const iniciarSesion = useCallback(async ({ token, usuario: u }) => {
    setToken(token);
    await tokenStorage.set(token);
    aplicarUsuario(u);
    registrarDispositivo(u);
  }, [aplicarUsuario, registrarDispositivo]);

  // Restaurar la sesión guardada al abrir la app.
  useEffect(() => {
    onSesionExpirada((msg) => {
      if (!usuarioRef.current) return;
      setAvisoSesion(msg || 'Tu sesión expiró. Iniciá sesión de nuevo.');
      purgarSesion();
    });
    (async () => {
      try {
        const token = await tokenStorage.get();
        if (token) {
          setToken(token);
          try {
            const { usuario: u } = await api('/auth/me');
            aplicarUsuario(u);
            registrarDispositivo(u);
          } catch (e) {
            // Sin red: dejamos la sesión abierta con los datos que haya; con 401 se purga.
            if (e.status === 401) await purgarSesion();
            else if (e.red) {
              const cache = await AsyncStorage.getItem('blendgo.usuario');
              if (cache) setUsuario(JSON.parse(cache));
            }
          }
        }
      } finally {
        setCargando(false);
      }
    })();
  }, [aplicarUsuario, purgarSesion, registrarDispositivo]);

  // Cache del usuario para poder abrir la app sin conexión.
  useEffect(() => {
    if (usuario) AsyncStorage.setItem('blendgo.usuario', JSON.stringify(usuario)).catch(() => {});
    else AsyncStorage.removeItem('blendgo.usuario').catch(() => {});
  }, [usuario]);

  const value = useMemo(() => ({
    usuario,
    cargando,
    avisoSesion,
    limpiarAviso: () => setAvisoSesion(null),
    googleDisponible: !!GoogleSignin && !!GOOGLE_WEB_CLIENT_ID && Platform.OS !== 'web',
    // Para diagnóstico: por qué no aparece el botón de Google.
    googleMotivo: Platform.OS === 'web' ? 'web' : !GoogleSignin ? 'expo-go' : !GOOGLE_WEB_CLIENT_ID ? 'sin-client-id' : 'ok',

    login: async (email, password) => iniciarSesion(await api('/auth/login', { method: 'POST', body: { email, password }, auth: false })),
    register: async (nombre, email, password) => iniciarSesion(await api('/auth/register', { method: 'POST', body: { nombre, email, password }, auth: false })),
    resetPassword: async (email, codigo, password) => iniciarSesion(await api('/auth/reset', { method: 'POST', body: { email, codigo, password }, auth: false })),

    loginGoogle: async () => {
      if (!GoogleSignin) throw new Error('El inicio con Google funciona solo en la app instalada (APK), no en Expo Go ni en la web.');
      if (!GOOGLE_WEB_CLIENT_ID) throw new Error('Falta EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID en eas.json. Cargalo y generá el APK de nuevo.');
      try {
        configurarGoogle();
        await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
        const r = await GoogleSignin.signIn();
        if (!isSuccessResponse(r)) return false; // el usuario cerró la ventana de Google
        const idToken = r.data?.idToken;
        if (!idToken) throw new Error('Google no devolvió un token de identidad. Revisá que el ID de eas.json sea el del cliente Web.');
        await iniciarSesion(await api('/auth/google', { method: 'POST', body: { idToken }, auth: false }));
        return true;
      } catch (e) {
        if (isErrorWithCode?.(e) && e.code === statusCodes.SIGN_IN_CANCELLED) return false;
        throw new Error(mensajeErrorGoogle(e));
      }
    },


    logout: async () => {
      const push = await pushTokenGuardado();
      await api('/auth/logout', { method: 'POST', body: { pushToken: push } }).catch(() => {});
      if (GoogleSignin && googleConfigurado) await GoogleSignin.signOut().catch(() => {});
      await purgarSesion();
    },

    /** Para cuando el servidor devuelve un token nuevo (cambio de contraseña). */
    reemplazarSesion: iniciarSesion,
    setUsuario: aplicarUsuario,
    refrescar: async () => {
      const { usuario: u } = await api('/auth/me');
      setUsuario(u);
      return u;
    },
    purgarSesion,
  }), [usuario, cargando, avisoSesion, iniciarSesion, aplicarUsuario, purgarSesion]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);

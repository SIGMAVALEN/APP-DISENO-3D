// Modo offline con sincronización en segundo plano.
// Si el usuario valida un ejercicio sin conexión, el intento se guarda en una cola
// local (AsyncStorage) y se reenvía automáticamente cuando vuelve la red o cuando
// la app vuelve al primer plano. El servidor recalcula todo: no se puede hacer trampa.
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { AppState } from 'react-native';
import { api } from '../api/client';

const KEY = 'blendgo.colaSync';
let sincronizando = false;
const oyentes = new Set();

export const onSync = (fn) => { oyentes.add(fn); return () => oyentes.delete(fn); };

async function leer() {
  try { return JSON.parse((await AsyncStorage.getItem(KEY)) || '[]'); } catch { return []; }
}
const guardar = (cola) => AsyncStorage.setItem(KEY, JSON.stringify(cola));

export async function encolarValidacion(idEjercicio, estado) {
  const cola = (await leer()).filter((i) => i.idEjercicio !== idEjercicio);
  cola.push({ idEjercicio, estado, creado: Date.now() });
  await guardar(cola);
}

export const pendientes = async () => (await leer()).length;

export async function sincronizar() {
  if (sincronizando) return;
  sincronizando = true;
  try {
    const cola = await leer();
    if (!cola.length) return;
    const restantes = [];
    const resultados = [];
    for (const item of cola) {
      try {
        resultados.push(await api(`/ejercicios/${item.idEjercicio}/validar`, { method: 'POST', body: { estado: item.estado } }));
      } catch (e) {
        if (e.red) restantes.push(item); // sigue sin red: se reintenta después
      }
    }
    await guardar(restantes);
    if (resultados.length) oyentes.forEach((fn) => fn(resultados));
  } finally {
    sincronizando = false;
  }
}

/** Inicia los disparadores de sincronización. Devuelve una función para detenerlos. */
export function iniciarSincronizacion() {
  const offNet = NetInfo.addEventListener((s) => { if (s.isConnected && s.isInternetReachable !== false) sincronizar(); });
  const subApp = AppState.addEventListener('change', (s) => { if (s === 'active') sincronizar(); });
  sincronizar();
  return () => { offNet(); subApp.remove(); };
}

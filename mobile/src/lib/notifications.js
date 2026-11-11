// Notificaciones push (remotas, vía Expo Push Service) y locales (recordatorio diario).
// Nota: desde SDK 53, las push remotas NO funcionan en Expo Go en Android;
// sí funcionan en el APK. Las notificaciones locales funcionan en ambos.
import { Platform } from 'react-native';
import { Notifications } from './notifModule';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { pushDisponible } from './entorno';

if (Notifications) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

async function asegurarCanal() {
  if (Notifications && Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'BlendGO!',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 200, 120, 200],
      lightColor: '#6366F1',
    });
  }
}

/** Pide permiso y devuelve el Expo Push Token, o null si no se puede. */
export async function obtenerPushToken() {
  // Expo Go en Android no tiene push remotas desde SDK 53 (en el APK sí funcionan).
  if (!pushDisponible || !Device.isDevice) return null;
  try {
    await asegurarCanal();
    const { status: actual } = await Notifications.getPermissionsAsync();
    let estado = actual;
    if (actual !== 'granted') estado = (await Notifications.requestPermissionsAsync()).status;
    if (estado !== 'granted') return null;
    const projectId = Constants?.expoConfig?.extra?.eas?.projectId || Constants?.easConfig?.projectId;
    if (!projectId) return null;
    const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
    await AsyncStorage.setItem('blendgo.pushToken', data);
    return data;
  } catch (e) {
    console.log('[push] No disponible:', e.message);
    return null;
  }
}

export const pushTokenGuardado = () => AsyncStorage.getItem('blendgo.pushToken');

const RECORDATORIO = 'blendgo-recordatorio-diario';

/** Programa (o cancela) un recordatorio local diario a las 19:00. Funciona sin conexión. */
export async function configurarRecordatorioDiario(activo) {
  if (Platform.OS === 'web') return;
  if (!Notifications) return;
  try {
    await Notifications.cancelScheduledNotificationAsync(RECORDATORIO).catch(() => {});
    if (!activo) return;
    await asegurarCanal();
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') return;
    await Notifications.scheduleNotificationAsync({
      identifier: RECORDATORIO,
      content: { title: '🧊 Hora de practicar', body: 'Un ejercicio de 3 minutos mantiene tu racha viva.', data: { tipo: 'recordatorio' } },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour: 19, minute: 0, channelId: 'default' },
    });
  } catch (e) {
    console.log('[notif] No se pudo programar el recordatorio:', e.message);
  }
}

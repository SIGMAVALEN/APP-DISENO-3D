// Detecta si la app corre dentro de Expo Go (que solo trae módulos nativos propios).
// En Expo Go se desactivan: login con Google (módulo nativo) y push remotas en Android.
import { Platform } from 'react-native';
import { isRunningInExpoGo } from 'expo';

export const enExpoGo = (() => { try { return isRunningInExpoGo(); } catch { return false; } })();
export const pushDisponible = Platform.OS !== 'web' && !(enExpoGo && Platform.OS === 'android');
export const googleNativoDisponible = Platform.OS !== 'web' && !enExpoGo;

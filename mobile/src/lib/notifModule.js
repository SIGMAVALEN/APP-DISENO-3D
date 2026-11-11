// Carga expo-notifications solo donde existe. En Expo Go no se importa:
// su módulo nativo de topics no existe ahí y tira "cannot find native module".
import { enExpoGo } from './entorno';

export const Notifications = enExpoGo ? null : require('expo-notifications');

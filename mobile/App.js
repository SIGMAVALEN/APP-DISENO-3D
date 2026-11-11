import { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider, useTheme } from './src/context/ThemeContext';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import Navigation, { navigationRef } from './src/navigation';
import { iniciarSincronizacion } from './src/lib/offlineQueue';
import { Notifications } from './src/lib/notifModule';

function Raiz() {
  const { modo } = useTheme();
  const { usuario } = useAuth();

  // Sincronización en segundo plano de intentos hechos sin conexión.
  useEffect(() => (usuario ? iniciarSincronizacion() : undefined), [usuario?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Al tocar una notificación, abrir el ejercicio relacionado.
  const abrirDesdeNotificacion = (response) => {
    const data = response?.notification?.request?.content?.data || {};
    if (!navigationRef.isReady() || !usuario) return;
    if (data.idEjercicio) navigationRef.navigate('Ejercicio', { id: Number(data.idEjercicio) });
    else if (data.tipo && data.tipo !== 'recordatorio') navigationRef.navigate('Notificaciones');
  };
  useEffect(() => {
    if (!Notifications) return undefined;
    const sub = Notifications.addNotificationResponseReceivedListener(abrirDesdeNotificacion);
    return () => sub.remove();
  }); // se re-suscribe con el usuario actual

  return (
    <>
      <StatusBar style={modo === 'dark' ? 'light' : 'dark'} />
      <Navigation
        onReady={() => {
          if (!Notifications) return;
          try {
            abrirDesdeNotificacion(Notifications.getLastNotificationResponse());
            Notifications.clearLastNotificationResponse();
          } catch {
            // No disponible en web
          }
        }}
      />
    </>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <AuthProvider>
          <Raiz />
        </AuthProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

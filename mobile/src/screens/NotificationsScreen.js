import { useEffect } from 'react';
import { Pressable, RefreshControl, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../api/client';
import { useTheme } from '../context/ThemeContext';
import { useApi } from '../lib/useApi';
import { Card, confirmar, ErrorEstado, EstadoVacio, fechaRelativa, Loading, Row, Screen, T } from '../components/ui';

const ICONOS = { ejercicio: 'cube-outline', comentario: 'chatbubble-outline', nivel: 'arrow-up-circle-outline', insignia: 'ribbon-outline', recordatorio: 'flame-outline', rol: 'key-outline' };

export default function NotificationsScreen({ navigation }) {
  const { colors } = useTheme();
  const { data, error, cargando, refrescando, recargar, setData } = useApi('/notificaciones');

  // Al salir de la pantalla se marcan como leídas.
  useEffect(() => navigation.addListener('blur', () => { api('/notificaciones/leer', { method: 'POST', body: {} }).catch(() => {}); }), [navigation]);

  useEffect(() => {
    navigation.setOptions({
      headerRight: data?.items?.length
        ? () => (
            <Pressable
              hitSlop={10}
              accessibilityLabel="Borrar todas"
              onPress={async () => {
                if (!(await confirmar('Borrar notificaciones', '¿Borrar todas las notificaciones?', 'Borrar', true))) return;
                await api('/notificaciones', { method: 'DELETE' }).catch(() => {});
                setData({ noLeidas: 0, items: [] });
              }}
            >
              <Ionicons name="trash-outline" size={21} color={colors.textMuted} />
            </Pressable>
          )
        : undefined,
    });
  }, [navigation, data, colors, setData]);

  if (cargando) return <Loading />;
  return (
    <Screen edges={[]} refreshControl={<RefreshControl refreshing={refrescando} onRefresh={recargar} tintColor={colors.primary} />}>
      {error && !data ? <ErrorEstado error={error} onRetry={recargar} /> : null}
      {data?.items.length === 0 ? <EstadoVacio icon="notifications-off-outline" titulo="Sin notificaciones" texto="Acá vas a ver nuevos ejercicios, respuestas y logros." /> : null}
      <View style={{ gap: 10 }}>
        {data?.items.map((n) => (
          <Card
            key={n.id}
            onPress={n.data?.idEjercicio ? () => navigation.navigate('Ejercicio', { id: n.data.idEjercicio }) : undefined}
            style={{ flexDirection: 'row', gap: 12, padding: 14, borderColor: n.leida ? colors.border : colors.primary + '88' }}
          >
            <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name={ICONOS[n.tipo] || 'notifications-outline'} size={19} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Row style={{ justifyContent: 'space-between' }}>
                <T weight="700" style={{ flex: 1 }} numberOfLines={1}>{n.titulo}</T>
                {!n.leida ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary }} /> : null}
              </Row>
              <T muted size={13.5} style={{ marginTop: 2 }}>{n.cuerpo}</T>
              <T muted size={11.5} style={{ marginTop: 4 }}>{fechaRelativa(n.creadoEn)}</T>
            </View>
          </Card>
        ))}
      </View>
    </Screen>
  );
}

import { RefreshControl, View } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { useApi } from '../lib/useApi';
import { Avatar, Card, ErrorEstado, EstadoVacio, H1, Loading, Row, Screen, T } from '../components/ui';

const MEDALLAS = ['🥇', '🥈', '🥉'];

export default function RankingScreen() {
  const { colors } = useTheme();
  const { data, error, cargando, refrescando, recargar } = useApi('/ranking');

  if (cargando) return <Loading />;
  return (
    <Screen refreshControl={<RefreshControl refreshing={refrescando} onRefresh={recargar} tintColor={colors.primary} />}>
      <H1>Ranking</H1>
      <T muted style={{ marginBottom: 18 }}>Los modeladores con más XP de la comunidad.</T>
      {error && !data ? <ErrorEstado error={error} onRetry={recargar} /> : null}
      {data?.length === 0 ? <EstadoVacio icon="podium-outline" titulo="Todavía no hay estudiantes" /> : null}
      <View style={{ gap: 10 }}>
        {data?.map((u) => (
          <Card key={u.id} glow={u.soyYo} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 13 }}>
            <T weight="800" size={u.posicion <= 3 ? 22 : 15} style={{ width: 32, textAlign: 'center' }} color={colors.textMuted}>
              {MEDALLAS[u.posicion - 1] || u.posicion}
            </T>
            <Avatar uri={u.avatar} nombre={u.nombre} size={40} />
            <View style={{ flex: 1 }}>
              <T weight="700" numberOfLines={1}>{u.nombre}{u.soyYo ? ' (vos)' : ''}</T>
              <T muted size={12.5}>Nivel {u.nivel} · {u.completados} ejercicios · 🔥 {u.racha}</T>
            </View>
            <Row gap={2}><T weight="800" color={colors.primary}>{u.xp}</T><T muted size={12}> XP</T></Row>
          </Card>
        ))}
      </View>
    </Screen>
  );
}

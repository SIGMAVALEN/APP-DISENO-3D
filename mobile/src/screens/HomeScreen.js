// Dashboard de inicio: banner con nivel/XP, racha, accesos rápidos y
// ejercicios agrupados por categoría con estado Pendiente/Completado.
import { useEffect, useMemo, useState } from 'react';
import { Pressable, RefreshControl, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useApi } from '../lib/useApi';
import { onSync, pendientes } from '../lib/offlineQueue';
import { Avatar, Card, Chip, colorDificultad, ErrorEstado, EstadoVacio, H2, Loading, ProgressBar, Row, Screen, T } from '../components/ui';

const FILTROS = ['Todas', 'Fácil', 'Medio', 'Avanzado'];

export default function HomeScreen({ navigation }) {
  const { colors } = useTheme();
  const { usuario, refrescar } = useAuth();
  const ejercicios = useApi('/ejercicios');
  const categorias = useApi('/categorias');
  const notifs = useApi('/notificaciones');
  const [filtro, setFiltro] = useState('Todas');
  const [cola, setCola] = useState(0);

  useEffect(() => {
    pendientes().then(setCola);
    return onSync(() => {
      pendientes().then(setCola);
      ejercicios.recargar();
      refrescar().catch(() => {});
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Mantener actualizado el usuario (XP/nivel) al volver al inicio.
  useEffect(() => { if (ejercicios.data) refrescar().catch(() => {}); }, [ejercicios.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const lista = useMemo(() => ejercicios.data || [], [ejercicios.data]);
  const completados = lista.filter((e) => e.completado).length;
  const siguiente = lista.find((e) => !e.completado);
  const grupos = useMemo(() => {
    const filtrados = lista.filter((e) => filtro === 'Todas' || e.dificultad === filtro);
    return (categorias.data || [])
      .map((c) => ({ ...c, ejercicios: filtrados.filter((e) => e.idCategoria === c.id) }))
      .filter((g) => g.ejercicios.length);
  }, [lista, categorias.data, filtro]);

  if (ejercicios.cargando || categorias.cargando) return <Loading texto="Preparando tu estudio 3D…" />;
  if (ejercicios.error && !ejercicios.data) return <Screen><ErrorEstado error={ejercicios.error} onRetry={ejercicios.recargar} /></Screen>;

  return (
    <Screen refreshControl={<RefreshControl refreshing={ejercicios.refrescando} onRefresh={() => { ejercicios.recargar(); categorias.recargar(); notifs.recargar(); }} tintColor={colors.primary} />}>
      <Row style={{ justifyContent: 'space-between', marginBottom: 16 }}>
        <Row>
          <Avatar uri={usuario.avatar} nombre={usuario.nombre} size={42} />
          <View>
            <T muted size={13}>Hola,</T>
            <T weight="800" size={17}>{usuario.nombre.split(' ')[0]} 👋</T>
          </View>
        </Row>
        <Pressable onPress={() => navigation.navigate('Notificaciones')} hitSlop={8} accessibilityLabel={`Notificaciones, ${notifs.data?.noLeidas || 0} sin leer`}
          style={{ width: 42, height: 42, borderRadius: 14, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="notifications-outline" size={21} color={colors.text} />
          {notifs.data?.noLeidas ? (
            <View style={{ position: 'absolute', top: 6, right: 6, minWidth: 17, height: 17, borderRadius: 9, backgroundColor: colors.danger, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 }}>
              <T size={10} weight="800" color="#fff">{notifs.data.noLeidas > 9 ? '9+' : notifs.data.noLeidas}</T>
            </View>
          ) : null}
        </Pressable>
      </Row>

      {/* Banner de nivel y XP */}
      <LinearGradient colors={[colors.primary, '#4338CA']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ borderRadius: 20, padding: 18, marginBottom: 14 }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <View>
            <T color="#C7D2FE" size={12.5} weight="700">NIVEL {usuario.nivel}</T>
            <T color="#fff" size={22} weight="800">{usuario.rango}</T>
          </View>
          <View style={{ alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.14)', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8 }}>
            <T size={20}>🔥</T>
            <T color="#fff" weight="800" size={13}>{usuario.rachaActual} {usuario.rachaActual === 1 ? 'día' : 'días'}</T>
          </View>
        </Row>
        <ProgressBar value={usuario.xpNivelActual} max={usuario.xpParaSiguiente} color={colors.ai} height={10} style={{ marginTop: 16, backgroundColor: 'rgba(255,255,255,0.18)' }} />
        <Row style={{ justifyContent: 'space-between', marginTop: 8 }}>
          <T color="#E0E7FF" size={12.5}>{usuario.xpNivelActual} / {usuario.xpParaSiguiente} XP para el nivel {usuario.nivel + 1}</T>
          <T color="#E0E7FF" size={12.5} weight="700">{usuario.xp} XP</T>
        </Row>
      </LinearGradient>

      {cola > 0 ? (
        <Card style={{ marginBottom: 14, flexDirection: 'row', gap: 10, alignItems: 'center' }}>
          <Ionicons name="cloud-upload-outline" size={20} color={colors.warning} />
          <T size={13.5} style={{ flex: 1 }}>{cola} intento(s) guardado(s) sin conexión. Se sincronizan solos al volver la red.</T>
        </Card>
      ) : null}

      <Row style={{ marginBottom: 14 }}>
        <Card style={{ flex: 1, padding: 14 }}>
          <T muted size={12}>Completados</T>
          <T weight="800" size={20}>{completados}<T muted size={14}> / {lista.length}</T></T>
        </Card>
        <Card style={{ flex: 1, padding: 14 }} onPress={() => navigation.navigate('Simulador')}>
          <Row gap={6}><Ionicons name="sparkles" size={15} color={colors.ai} /><T muted size={12}>Modo libre</T></Row>
          <T weight="800" size={15} color={colors.ai}>Abrir estudio →</T>
        </Card>
      </Row>

      {siguiente ? (
        <Card glow onPress={() => navigation.navigate('Ejercicio', { id: siguiente.id })} style={{ marginBottom: 20 }}>
          <T size={12} weight="700" color={colors.primary}>CONTINUÁ DONDE QUEDASTE</T>
          <T weight="800" size={17} style={{ marginTop: 4 }}>{siguiente.titulo}</T>
          <T muted size={13.5} numberOfLines={2} style={{ marginTop: 2 }}>{siguiente.descripcion}</T>
        </Card>
      ) : lista.length ? (
        <Card style={{ marginBottom: 20 }}><T weight="700">🏆 ¡Completaste todos los ejercicios! Esperá nuevos desafíos de tus profes.</T></Card>
      ) : null}

      <H2 style={{ marginBottom: 10 }}>Cursos y niveles</H2>
      <Row style={{ marginBottom: 14, flexWrap: 'wrap' }} gap={8}>
        {FILTROS.map((f) => (
          <Chip key={f} label={f} active={filtro === f} color={f === 'Todas' ? colors.primary : colorDificultad(f, colors)} onPress={() => setFiltro(f)} />
        ))}
      </Row>

      {grupos.length === 0 ? <EstadoVacio titulo="No hay ejercicios" texto="Probá con otro filtro." /> : null}
      {grupos.map((g) => (
        <View key={g.id} style={{ marginBottom: 18 }}>
          <Row style={{ marginBottom: 8 }} gap={8}>
            <Ionicons name={g.icono || 'cube-outline'} size={18} color={colors.primary} />
            <T weight="800" size={16}>{g.nombre}</T>
            <T muted size={12.5}>· {g.ejercicios.filter((e) => e.completado).length}/{g.ejercicios.length}</T>
          </Row>
          <View style={{ gap: 10 }}>
            {g.ejercicios.map((e) => <TarjetaEjercicio key={e.id} e={e} onPress={() => navigation.navigate('Ejercicio', { id: e.id })} />)}
          </View>
        </View>
      ))}
    </Screen>
  );
}

function TarjetaEjercicio({ e, onPress }) {
  const { colors } = useTheme();
  return (
    <Card onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 }}>
      <View style={{ width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: e.completado ? colors.aiSoft : colors.cardAlt }}>
        <Ionicons name={e.completado ? 'checkmark-done' : 'cube-outline'} size={20} color={e.completado ? colors.ai : colors.textMuted} />
      </View>
      <View style={{ flex: 1, gap: 4 }}>
        <T weight="700" numberOfLines={1}>{e.titulo}</T>
        <Row gap={6}>
          <Chip label={e.dificultad} color={colorDificultad(e.dificultad, colors)} />
          <T muted size={12}>+{e.xpRecompensa} XP</T>
          {e.valoracionPromedio ? <T muted size={12}>· ★ {e.valoracionPromedio}</T> : null}
        </Row>
      </View>
      <T size={12} weight="700" color={e.completado ? colors.ai : colors.textMuted}>{e.completado ? 'Completado' : 'Pendiente'}</T>
    </Card>
  );
}

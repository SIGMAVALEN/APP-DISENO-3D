// Perfil: estadísticas de uso, rango, insignias y accesos a configuración y cierre de sesión.
import { useState } from 'react';
import { RefreshControl, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useApi } from '../lib/useApi';
import { Avatar, Button, Card, Chip, confirmar, Divider, ErrorEstado, H1, H2, ListItem, Loading, ProgressBar, Row, Screen, T } from '../components/ui';

const ROLES = { estudiante: 'Estudiante', profesor: 'Profesor', admin: 'Administrador' };

export default function ProfileScreen({ navigation }) {
  const { colors } = useTheme();
  const { usuario, logout } = useAuth();
  const { data: s, error, cargando, refrescando, recargar } = useApi('/me/estadisticas');
  const [saliendo, setSaliendo] = useState(false);

  const salir = async () => {
    if (!(await confirmar('Cerrar sesión', '¿Querés cerrar sesión en este dispositivo?', 'Cerrar sesión', true))) return;
    setSaliendo(true);
    await logout();
  };

  if (cargando) return <Loading />;

  return (
    <Screen refreshControl={<RefreshControl refreshing={refrescando} onRefresh={recargar} tintColor={colors.primary} />}>
      <View style={{ alignItems: 'center', gap: 8, marginBottom: 18 }}>
        <Avatar uri={usuario.avatar} nombre={usuario.nombre} size={88} />
        <H1 center>{usuario.nombre}</H1>
        <T muted>{usuario.email}</T>
        <Row gap={8}>
          <Chip label={usuario.rango} icon="ribbon-outline" color={colors.primary} />
          <Chip label={ROLES[usuario.rol]} icon="shield-outline" color={usuario.rol === 'estudiante' ? colors.textMuted : colors.ai} />
        </Row>
      </View>

      <Card style={{ marginBottom: 14 }}>
        <Row style={{ justifyContent: 'space-between', marginBottom: 8 }}>
          <T weight="700">Nivel {usuario.nivel}</T>
          <T muted size={13}>{usuario.xpNivelActual}/{usuario.xpParaSiguiente} XP</T>
        </Row>
        <ProgressBar value={usuario.xpNivelActual} max={usuario.xpParaSiguiente} color={colors.ai} />
      </Card>

      {error && !s ? <ErrorEstado error={error} onRetry={recargar} /> : null}
      {s ? (
        <>
          <Row style={{ marginBottom: 14 }} gap={10}>
            <Stat icon="flash" valor={s.xp} label="XP total" color={colors.primary} />
            <Stat icon="checkmark-done" valor={`${s.ejerciciosCompletados}/${s.ejerciciosTotales}`} label="Ejercicios" color={colors.ai} />
          </Row>
          <Row style={{ marginBottom: 20 }} gap={10}>
            <Stat icon="flame" valor={`${s.rachaActual} d`} label={`Racha (máx ${usuario.rachaMaxima})`} color={colors.warning} />
            <Stat icon="repeat" valor={s.intentosTotales} label="Intentos" color={colors.axisZ} />
          </Row>

          <H2 style={{ marginBottom: 10 }}>Insignias</H2>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 22 }}>
            {s.insignias.map((i) => (
              <Card key={i.codigo} style={{ width: '31%', flexGrow: 1, alignItems: 'center', padding: 12, opacity: i.obtenida ? 1 : 0.45 }}>
                <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: i.obtenida ? colors.primarySoft : colors.cardAlt, alignItems: 'center', justifyContent: 'center', marginBottom: 6 }}>
                  <Ionicons name={i.obtenida ? i.icono : 'lock-closed-outline'} size={22} color={i.obtenida ? colors.primary : colors.textMuted} />
                </View>
                <T size={12} weight="700" center numberOfLines={2}>{i.nombre}</T>
                <T size={10.5} muted center numberOfLines={3} style={{ marginTop: 2 }}>{i.descripcion}</T>
              </Card>
            ))}
          </View>

          {s.completados.length ? (
            <>
              <H2 style={{ marginBottom: 8 }}>Últimos completados</H2>
              <Card style={{ marginBottom: 22, paddingVertical: 4 }}>
                {s.completados.slice(0, 5).map((c, i) => (
                  <View key={c.id}>
                    {i ? <Divider /> : null}
                    <ListItem icon="checkmark-circle-outline" titulo={c.titulo} subtitulo={`${c.categoria} · ${c.dificultad}`} onPress={() => navigation.navigate('Ejercicio', { id: c.id })} />
                  </View>
                ))}
              </Card>
            </>
          ) : null}
        </>
      ) : null}

      <Card style={{ paddingVertical: 4, marginBottom: 18 }}>
        <ListItem icon="settings-outline" titulo="Configuración de la cuenta" subtitulo="Datos, contraseña, tema y notificaciones" onPress={() => navigation.navigate('Configuracion')} />
        <Divider />
        <ListItem icon="notifications-outline" titulo="Notificaciones" onPress={() => navigation.navigate('Notificaciones')} />
      </Card>
      <Button title="Cerrar sesión" icon="log-out-outline" variant="danger" onPress={salir} loading={saliendo} />
    </Screen>
  );
}

function Stat({ icon, valor, label, color }) {
  return (
    <Card style={{ flex: 1, padding: 14 }}>
      <Ionicons name={icon} size={18} color={color} />
      <T weight="800" size={20} style={{ marginTop: 6 }}>{valor}</T>
      <T muted size={12}>{label}</T>
    </Card>
  );
}

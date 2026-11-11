// Perfil público de un usuario + interacción: saludos prefijados (emoji + mensaje corto).
// Se abre desde el ranking, los comentarios, el autor de un ejercicio o una notificación.
import { useLayoutEffect, useState } from 'react';
import { Animated, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../api/client';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { useApi } from '../lib/useApi';
import { esSuper } from '../lib/roles';
import {
  Avatar, Banner, Card, Chip, colorDificultad, ErrorEstado, fechaRelativa, H1, H2, Loading, Row, Screen, T, vibrar,
} from '../components/ui';

export default function PublicProfileScreen({ route, navigation }) {
  const { id } = route.params;
  const { colors } = useTheme();
  const { usuario: yo } = useAuth();
  const { data: p, error, cargando, refrescando, recargar, setData } = useApi(`/usuarios/${id}/perfil`);
  const [enviando, setEnviando] = useState(null);
  const [msg, setMsg] = useState(null);
  const [pop, setPop] = useState(null);

  useLayoutEffect(() => {
    navigation.setOptions({ title: p ? (p.esYo ? 'Tu perfil público' : p.usuario.nombre.split(' ')[0]) : 'Perfil' });
  }, [navigation, p]);

  const saludar = async (s) => {
    setEnviando(s.codigo);
    setMsg(null);
    try {
      const r = await api(`/usuarios/${id}/saludos`, { method: 'POST', body: { codigo: s.codigo } });
      vibrar('success');
      setPop((prev) => ({ emoji: s.emoji, key: (prev?.key || 0) + 1 }));
      // Actualización optimista del contador y la lista, sin recargar todo.
      setData((d) => {
        const resumen = [...d.saludos.resumen];
        const i = resumen.findIndex((x) => x.codigo === s.codigo);
        if (i >= 0) resumen[i] = { ...resumen[i], n: resumen[i].n + 1 };
        else resumen.push({ ...s, n: 1 });
        resumen.sort((a, b) => b.n - a.n);
        const nuevo = { id: -Date.now(), ...s, creadoEn: null, de: { id: yo.id, nombre: yo.nombre, avatar: yo.avatar } };
        return {
          ...d,
          restantesHoy: r.restantesHoy,
          saludos: { total: d.saludos.total + 1, resumen, recientes: [nuevo, ...d.saludos.recientes].slice(0, 15) },
        };
      });
      setMsg({ tipo: 'ok', texto: `Le mandaste ${s.emoji} "${s.texto}" a ${p.usuario.nombre.split(' ')[0]}` });
    } catch (e) {
      vibrar('error');
      setMsg({ tipo: 'error', texto: e.message });
    } finally {
      setEnviando(null);
    }
  };

  if (cargando) return <Loading />;
  if (error && !p) return <Screen edges={[]}><ErrorEstado error={error} onRetry={recargar} /></Screen>;
  const u = p.usuario;

  return (
    <View style={{ flex: 1 }}>
      <Screen edges={['bottom']} refreshControl={<RefreshControl refreshing={refrescando} onRefresh={recargar} tintColor={colors.primary} />}>
        <View style={{ alignItems: 'center', gap: 8, marginBottom: 18 }}>
          <Avatar uri={u.avatar} nombre={u.nombre} size={84} />
          <H1 center>{u.nombre}</H1>
          <Row gap={8}>
            <Chip label={u.rango} icon="ribbon-outline" color={colors.primary} />
            {esSuper(u) ? <Chip label="Superadmin" icon="shield-checkmark-outline" color={colors.warning} /> : null}
          </Row>
          <T muted size={13}>Nivel {u.nivel} · {u.xp} XP · 🔥 {u.racha} {u.racha === 1 ? 'día' : 'días'}</T>
        </View>

        <Row style={{ marginBottom: 18 }} gap={10}>
          <Stat valor={p.completados} label="Completados" icon="checkmark-done" color={colors.ai} />
          <Stat valor={p.aportes.length} label="Aportes" icon="cube-outline" color={colors.primary} />
          <Stat valor={p.saludos.total} label="Saludos" icon="happy-outline" color={colors.warning} />
        </Row>

        {msg ? <Banner tipo={msg.tipo} onClose={() => setMsg(null)}>{msg.texto}</Banner> : null}

        {!p.esYo ? (
          <Card style={{ marginBottom: 20 }}>
            <Row style={{ justifyContent: 'space-between', marginBottom: 12 }}>
              <T weight="800">Mandale un saludo</T>
              <T muted size={12}>{p.restantesHoy > 0 ? `Te quedan ${p.restantesHoy} hoy` : 'Llegaste al límite de hoy'}</T>
            </Row>
            <View style={styles.grilla}>
              {p.catalogo.map((s) => {
                const inactivo = p.restantesHoy <= 0 || !!enviando;
                return (
                  <Pressable
                    key={s.codigo}
                    onPress={() => saludar(s)}
                    disabled={inactivo}
                    accessibilityLabel={`Mandar ${s.texto}`}
                    style={({ pressed }) => [
                      styles.boton,
                      { backgroundColor: colors.cardAlt, borderColor: colors.border, opacity: inactivo && enviando !== s.codigo ? 0.5 : 1 },
                      pressed && { transform: [{ scale: 0.94 }], borderColor: colors.primary },
                    ]}
                  >
                    <T size={26}>{s.emoji}</T>
                    <T size={11.5} weight="600" center numberOfLines={2}>{s.texto}</T>
                  </Pressable>
                );
              })}
            </View>
          </Card>
        ) : (
          <Card style={{ marginBottom: 20, flexDirection: 'row', gap: 10, alignItems: 'center' }}>
            <Ionicons name="eye-outline" size={20} color={colors.textMuted} />
            <T muted size={13.5} style={{ flex: 1 }}>Así te ve el resto de la comunidad. Tu email no se muestra.</T>
          </Card>
        )}

        {p.saludos.resumen.length ? (
          <>
            <H2 style={{ marginBottom: 10 }}>{p.esYo ? 'Lo que te dijeron' : 'Saludos recibidos'}</H2>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
              {p.saludos.resumen.map((r) => (
                <View key={r.codigo} style={[styles.contador, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <T size={17}>{r.emoji}</T>
                  <T weight="800" size={13}>×{r.n}</T>
                </View>
              ))}
            </View>
            <Card style={{ paddingVertical: 6, marginBottom: 20 }}>
              {p.saludos.recientes.map((s, i) => (
                <Pressable
                  key={s.id}
                  onPress={() => navigation.push('PerfilPublico', { id: s.de.id })}
                  style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, borderTopWidth: i ? 1 : 0, borderTopColor: colors.border, opacity: pressed ? 0.6 : 1 })}
                >
                  <Avatar uri={s.de.avatar} nombre={s.de.nombre} size={30} />
                  <T size={13.5} style={{ flex: 1 }} numberOfLines={1}>
                    <T weight="700" size={13.5}>{s.de.nombre}</T>: {s.emoji} {s.texto}
                  </T>
                  <T muted size={11.5}>{s.creadoEn ? fechaRelativa(s.creadoEn) : 'recién'}</T>
                </Pressable>
              ))}
            </Card>
          </>
        ) : (
          <T muted center style={{ marginBottom: 20 }}>{p.esYo ? 'Todavía nadie te mandó saludos.' : `Sé el primero en saludar a ${u.nombre.split(' ')[0]}.`}</T>
        )}

        {p.aportes.length ? (
          <>
            <H2 style={{ marginBottom: 10 }}>Ejercicios aportados</H2>
            <View style={{ gap: 8, marginBottom: 20 }}>
              {p.aportes.map((a) => (
                <Card key={a.id} onPress={() => navigation.navigate('Ejercicio', { id: a.id })} style={{ padding: 13, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Ionicons name="cube-outline" size={19} color={colors.primary} />
                  <T weight="700" style={{ flex: 1 }} numberOfLines={1}>{a.titulo}</T>
                  <Chip label={a.dificultad} color={colorDificultad(a.dificultad, colors)} />
                  {a.valoracion ? <T muted size={12}>★ {a.valoracion}</T> : null}
                </Card>
              ))}
            </View>
          </>
        ) : null}

        {p.insignias.length ? (
          <>
            <H2 style={{ marginBottom: 10 }}>Insignias</H2>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {p.insignias.map((i) => <Chip key={i.codigo} label={i.nombre} icon={i.icono} color={colors.primary} />)}
            </View>
          </>
        ) : null}
      </Screen>
      {pop ? <EmojiPop key={pop.key} emoji={pop.emoji} onFin={() => setPop(null)} /> : null}
    </View>
  );
}

function Stat({ valor, label, icon, color }) {
  return (
    <Card style={{ flex: 1, padding: 12, alignItems: 'center' }}>
      <Ionicons name={icon} size={18} color={color} />
      <T weight="800" size={19} style={{ marginTop: 4 }}>{valor}</T>
      <T muted size={11.5}>{label}</T>
    </Card>
  );
}

/** Emoji grande que sube y se desvanece al mandar un saludo. */
function EmojiPop({ emoji, onFin }) {
  const [anim] = useState(() => {
    const v = new Animated.Value(0);
    Animated.timing(v, { toValue: 1, duration: 900, useNativeDriver: true }).start(onFin);
    return v;
  });
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
      <Animated.Text
        style={{
          fontSize: 96,
          opacity: anim.interpolate({ inputRange: [0, 0.2, 0.7, 1], outputRange: [0, 1, 1, 0] }),
          transform: [
            { translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [40, -80] }) },
            { scale: anim.interpolate({ inputRange: [0, 0.25, 1], outputRange: [0.4, 1.15, 1] }) },
          ],
        }}
      >
        {emoji}
      </Animated.Text>
    </View>
  );
}

const styles = StyleSheet.create({
  grilla: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  boton: { width: '23%', flexGrow: 1, alignItems: 'center', gap: 3, paddingVertical: 10, paddingHorizontal: 4, borderRadius: 14, borderWidth: 1 },
  contador: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, borderWidth: 1 },
});

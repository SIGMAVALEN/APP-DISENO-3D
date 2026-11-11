// Simulador 3D: viewport central, controles TRS, chat con IA (bottom sheet) y
// validación del ejercicio. Funciona en "modo libre" (pestaña) o con un ejercicio.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Animated, Pressable, ScrollView, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import Viewport3D from '../components/Viewport3D';
import TransformControls from '../components/TransformControls';
import ChatSheet from '../components/ChatSheet';
import { Banner, Button, Chip, colorDificultad, ErrorEstado, GlassModal, H2, Loading, ProgressBar, Row, T, vibrar } from '../components/ui';
import { aplicarAccion, clonarEstado, coincide, ESTADO_DEFAULT, interpolarEstado } from '../lib/math3d';
import { encolarValidacion } from '../lib/offlineQueue';

export default function SimulatorScreen({ route, navigation }) {
  const id = route.params?.id;
  const { colors } = useTheme();
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { setUsuario } = useAuth();

  const [ejercicio, setEjercicio] = useState(null);
  const [cargando, setCargando] = useState(!!id);
  const [errorCarga, setErrorCarga] = useState(null);
  const [estado, setEstado] = useState(clonarEstado(ESTADO_DEFAULT));
  const [chat, setChat] = useState(false);
  const [validando, setValidando] = useState(false);
  const [resultado, setResultado] = useState(null);
  const animRef = useRef(null);
  const enModoLibre = !id;

  const cargar = useCallback(async () => {
    if (!id) return;
    setCargando(true);
    try {
      const e = await api(`/ejercicios/${id}`);
      setEjercicio(e);
      setEstado(clonarEstado(e.estadoInicial));
      setErrorCarga(null);
    } catch (e) {
      setErrorCarga(e);
    } finally {
      setCargando(false);
    }
  }, [id]);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial de datos
  useEffect(() => { cargar(); }, [cargar]);

  useLayoutEffect(() => {
    if (!enModoLibre) navigation.setOptions({ title: ejercicio?.titulo || 'Simulador' });
  }, [navigation, ejercicio, enModoLibre]);

  useEffect(() => () => cancelAnimationFrame(animRef.current), []);

  const estadoRef = useRef(estado);
  useEffect(() => { estadoRef.current = estado; }, [estado]);

  /** Anima suavemente el objeto hacia un nuevo estado (para las órdenes de la IA). */
  const animarHacia = useCallback((destino) => {
    cancelAnimationFrame(animRef.current);
    const desde = estadoRef.current;
    const inicio = Date.now();
    const paso = () => {
      const t = Math.min(1, (Date.now() - inicio) / 450);
      const suave = 1 - Math.pow(1 - t, 3);
      setEstado(t >= 1 ? destino : interpolarEstado(desde, destino, suave));
      if (t < 1) animRef.current = requestAnimationFrame(paso);
    };
    animRef.current = requestAnimationFrame(paso);
  }, []);

  const alRecibirAcciones = useCallback((acciones, estadoServidor) => {
    vibrar('success');
    // El servidor devuelve el estado final (misma lógica que aplicarAccion en el cliente).
    animarHacia(estadoServidor || acciones.reduce(aplicarAccion, estadoRef.current));
  }, [animarHacia]);

  const validar = async () => {
    setValidando(true);
    try {
      const r = await api(`/ejercicios/${id}/validar`, { method: 'POST', body: { estado } });
      vibrar(r.correcto ? 'success' : 'error');
      if (r.usuario) setUsuario(r.usuario);
      setResultado(r);
    } catch (e) {
      if (e.red) {
        // Sin conexión: feedback local inmediato + sincronización posterior.
        const ok = coincide(estado, ejercicio.estadoObjetivo);
        if (ok) await encolarValidacion(id, estado);
        setResultado({ offline: true, correcto: ok, pistas: ok ? [] : ['Todavía no coincide con el objetivo. Seguí ajustando.'] });
      } else {
        setResultado({ error: e.message });
      }
    } finally {
      setValidando(false);
    }
  };

  if (cargando) return <Loading texto="Cargando ejercicio…" />;
  if (errorCarga) return <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: 'center' }}><ErrorEstado error={errorCarga} onRetry={cargar} /></View>;

  const alturaViewport = Math.max(250, Math.min(420, height * 0.4));

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ paddingHorizontal: 14, paddingTop: enModoLibre ? insets.top + 8 : 10 }}>
        {enModoLibre ? (
          <Row style={{ justifyContent: 'space-between', marginBottom: 10 }}>
            <View>
              <H2>Estudio libre</H2>
              <T muted size={13}>Experimentá sin presión. Pedile cosas a Blendy.</T>
            </View>
          </Row>
        ) : (
          <View style={{ marginBottom: 10 }}>
            <Row gap={8} style={{ marginBottom: 4 }}>
              <Chip label={ejercicio.dificultad} color={colorDificultad(ejercicio.dificultad, colors)} />
              <Chip label={`+${ejercicio.xpRecompensa} XP`} color={colors.primary} icon="flash" />
              {ejercicio.completado ? <Chip label="Ya completado" color={colors.ai} icon="checkmark" /> : null}
            </Row>
            <T size={13.5} muted numberOfLines={2}>{ejercicio.descripcion}</T>
          </View>
        )}
        <Viewport3D estado={estado} objetivo={ejercicio?.estadoObjetivo} height={alturaViewport} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: enModoLibre ? 110 : insets.bottom + 24 }} keyboardShouldPersistTaps="handled">
        <TransformControls
          estado={estado}
          onChange={(e) => { cancelAnimationFrame(animRef.current); setEstado(e); }}
          onReset={() => animarHacia(clonarEstado(ejercicio?.estadoInicial || ESTADO_DEFAULT))}
        />
        {!enModoLibre ? (
          <Row style={{ marginTop: 14 }}>
            <Button title="Validar ejercicio" icon="checkmark-circle" onPress={validar} loading={validando} style={{ flex: 1 }} />
            <Button title="Blendy" icon="sparkles" variant="ai" onPress={() => setChat(true)} />
          </Row>
        ) : null}
      </ScrollView>

      {/* Botón flotante del tutor IA (en modo ejercicio va junto a "Validar") */}
      {enModoLibre ? <BotonIA onPress={() => setChat(true)} bottom={18} /> : null}

      <ChatSheet visible={chat} onClose={() => setChat(false)} estado={estado} idEjercicio={id} onAcciones={alRecibirAcciones} />

      <ModalResultado
        r={resultado}
        ejercicio={ejercicio}
        onClose={() => setResultado(null)}
        onVolver={() => { setResultado(null); navigation.goBack(); }}
        onAyuda={() => { setResultado(null); setChat(true); }}
      />
    </View>
  );
}

function BotonIA({ onPress, bottom }) {
  const { colors } = useTheme();
  const [pulso] = useState(() => new Animated.Value(1));
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulso, { toValue: 1.07, duration: 900, useNativeDriver: true }),
      Animated.timing(pulso, { toValue: 1, duration: 900, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [pulso]);
  return (
    <Animated.View style={{ position: 'absolute', right: 18, bottom, transform: [{ scale: pulso }] }}>
      <Pressable
        onPress={() => { vibrar(); onPress(); }}
        accessibilityLabel="Abrir chat con el tutor IA"
        style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.ai, paddingHorizontal: 18, paddingVertical: 14, borderRadius: 28, elevation: 6, shadowColor: colors.ai, shadowOpacity: 0.45, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } }}
      >
        <Ionicons name="sparkles" size={19} color="#fff" />
        <T color="#fff" weight="800">Blendy IA</T>
      </Pressable>
    </Animated.View>
  );
}

function ModalResultado({ r, ejercicio, onClose, onVolver, onAyuda }) {
  const { colors } = useTheme();
  if (!r) return null;

  if (r.error) {
    return (
      <GlassModal visible onClose={onClose}>
        <Banner>{r.error}</Banner>
        <Button title="Cerrar" variant="outline" onPress={onClose} />
      </GlassModal>
    );
  }

  return (
    <GlassModal visible onClose={onClose}>
      <View style={{ alignItems: 'center', gap: 6 }}>
        <View style={{ width: 70, height: 70, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: r.correcto ? colors.aiSoft : colors.dangerSoft }}>
          <Ionicons name={r.correcto ? 'trophy' : 'close-circle'} size={38} color={r.correcto ? colors.ai : colors.danger} />
        </View>
        <T size={22} weight="800" center>{r.correcto ? '¡Ejercicio logrado!' : 'Casi…'}</T>

        {r.offline ? (
          <T muted center size={13.5}>{r.correcto ? 'Estás sin conexión: guardamos tu intento y se va a sincronizar solo para sumarte la XP.' : 'Estás sin conexión.'}</T>
        ) : null}

        {r.correcto && !r.offline ? (
          r.yaCompletado ? (
            <T muted center>Ya lo habías completado. ¡Buena práctica!</T>
          ) : (
            <>
              <ContadorXP total={r.xpGanada} />
              {r.subioNivel ? <Chip label={`¡Subiste al nivel ${r.usuario.nivel}! ${r.usuario.rango}`} icon="arrow-up-circle" color={colors.ai} /> : null}
              <View style={{ alignSelf: 'stretch', marginTop: 8 }}>
                <ProgressBar value={r.usuario.xpNivelActual} max={r.usuario.xpParaSiguiente} color={colors.ai} />
                <T muted size={12} center style={{ marginTop: 5 }}>{r.usuario.xpNivelActual}/{r.usuario.xpParaSiguiente} XP · Nivel {r.usuario.nivel}</T>
              </View>
            </>
          )
        ) : null}

        {r.insigniasNuevas?.length ? (
          <View style={{ alignSelf: 'stretch', gap: 6, marginTop: 8 }}>
            {r.insigniasNuevas.map((i) => (
              <Row key={i.codigo} style={{ backgroundColor: colors.primarySoft, borderRadius: 12, padding: 10 }}>
                <Ionicons name={i.icono} size={22} color={colors.primary} />
                <View style={{ flex: 1 }}>
                  <T weight="800" size={13.5}>🏅 {i.nombre}</T>
                  <T muted size={12}>{i.descripcion}</T>
                </View>
              </Row>
            ))}
          </View>
        ) : null}

        {!r.correcto && r.pistas?.length ? (
          <View style={{ alignSelf: 'stretch', gap: 6, marginTop: 6 }}>
            {r.pistas.slice(0, 4).map((p) => (
              <Row key={p} gap={8}><Ionicons name="bulb-outline" size={16} color={colors.warning} /><T size={13.5} style={{ flex: 1 }}>{p}</T></Row>
            ))}
          </View>
        ) : null}
      </View>

      <View style={{ gap: 10, marginTop: 20 }}>
        {r.correcto ? (
          <Button title="Volver al ejercicio" icon="arrow-back" onPress={onVolver} />
        ) : (
          <>
            <Button title="Seguir intentando" onPress={onClose} />
            <Button title="Pedir ayuda a Blendy" icon="sparkles" variant="outline" onPress={onAyuda} />
          </>
        )}
        {r.correcto && ejercicio ? <Button title="Seguir en el simulador" variant="ghost" onPress={onClose} /> : null}
      </View>
    </GlassModal>
  );
}

/** Cuenta animada de la XP ganada (se monta de nuevo en cada resultado). */
function ContadorXP({ total }) {
  const { colors } = useTheme();
  const [n, setN] = useState(0);
  useEffect(() => {
    let v = 0;
    const t = setInterval(() => {
      v = Math.min(total, v + Math.ceil(total / 20));
      setN(v);
      if (v >= total) clearInterval(t);
    }, 30);
    return () => clearInterval(t);
  }, [total]);
  return <T size={34} weight="900" color={colors.primary}>+{n} XP</T>;
}

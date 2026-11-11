// Viewport 3D: render por software (proyección + painter's algorithm) dibujado con SVG.
// Funciona en Expo Go, APK y web sin WebGL. Incluye grilla, ejes, gizmo local,
// "fantasma" del objetivo, cámara orbital (arrastrar) y modo perspectiva/ortográfico.
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { PanResponder, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, G, Line, Polygon, Text as SvgText } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { ARISTAS, CARAS, caraVisible, crearCamara, iluminacion, sombrear, transformarCubo } from '../lib/math3d';

const CAM_INICIAL = { yaw: -35, pitch: 24, distancia: 11 };

function Viewport3D({ estado, objetivo, height = 300, compacto = false, interactivo = true }) {
  const { colors } = useTheme();
  const [size, setSize] = useState({ w: 320, h: height });
  const [cam, setCam] = useState(CAM_INICIAL);
  const [orto, setOrto] = useState(false);
  const inicio = useRef(CAM_INICIAL);

  // Los handlers leen refs solo durante el gesto, nunca durante el render.
  /* eslint-disable react-hooks/refs */
  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => interactivo,
        onMoveShouldSetPanResponder: (_e, g) => interactivo && (Math.abs(g.dx) > 4 || Math.abs(g.dy) > 4),
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: () => { inicio.current = camRef.current; },
        onPanResponderMove: (_e, g) => {
          setCam({
            ...inicio.current,
            yaw: inicio.current.yaw - g.dx * 0.4,
            pitch: Math.max(-10, Math.min(85, inicio.current.pitch + g.dy * 0.3)),
          });
        },
      }),
    [interactivo]
  );
  /* eslint-enable react-hooks/refs */
  const camRef = useRef(cam);
  useEffect(() => { camRef.current = cam; }, [cam]);

  const escena = useMemo(() => {
    const c = crearCamara({ ...cam, ancho: size.w, alto: size.h, orto });
    const P = (v) => c.proyectar(v);

    // Grilla en el plano Y=0
    const grilla = [];
    const N = 5;
    for (let i = -N; i <= N; i++) {
      if (i === 0) continue;
      grilla.push([P([i, 0, -N]), P([i, 0, N]), i % 5 === 0]);
      grilla.push([P([-N, 0, i]), P([N, 0, i]), i % 5 === 0]);
    }
    const ejes = [
      { a: P([-N, 0, 0]), b: P([N, 0, 0]), color: colors.axisX, label: 'X', fin: P([N + 0.5, 0, 0]) },
      { a: P([0, 0, -N]), b: P([0, 0, N]), color: colors.axisZ, label: 'Z', fin: P([0, 0, N + 0.5]) },
      { a: P([0, 0, 0]), b: P([0, 3.5, 0]), color: colors.axisY, label: 'Y', fin: P([0, 3.9, 0]) },
    ];

    // Cubo del usuario
    const { verts, normales, R } = transformarCubo(estado);
    const pv = verts.map(P);
    const caras = CARAS.map((f, i) => {
      const centro = [0, 1, 2].map((k) => f.idx.reduce((s, j) => s + verts[j][k], 0) / 4);
      return {
        puntos: f.idx.map((j) => `${pv[j].x},${pv[j].y}`).join(' '),
        prof: f.idx.reduce((s, j) => s + pv[j].prof, 0) / 4,
        visible: caraVisible(c, normales[i], centro) && f.idx.every((j) => pv[j].prof > 0.2),
        fill: sombrear(colors.primary, iluminacion(normales[i]) * 1.08),
      };
    })
      .filter((f) => f.visible)
      .sort((a, b) => b.prof - a.prof);

    // Gizmo local (ejes rotados del objeto)
    const centro = estado.position;
    const largo = 0.55 + Math.max(...estado.scale) * 0.5;
    const gizmo = [0, 1, 2].map((k) => {
      const dir = [R[0][k], R[1][k], R[2][k]];
      return { a: P(centro), b: P([centro[0] + dir[0] * largo, centro[1] + dir[1] * largo, centro[2] + dir[2] * largo]), color: [colors.axisX, colors.axisY, colors.axisZ][k] };
    });

    // Fantasma del objetivo
    let fantasma = null;
    if (objetivo) {
      const t = transformarCubo(objetivo).verts.map(P);
      fantasma = ARISTAS.map(([a, b]) => [t[a], t[b]]).filter(([a, b]) => a.prof > 0.2 && b.prof > 0.2);
    }
    return { grilla, ejes, caras, gizmo, centro: P(centro), fantasma, sombra: P([centro[0], 0, centro[2]]) };
  }, [cam, size, orto, estado, objetivo, colors]);

  const fmt = (v) => v.map((n) => (Math.round(n * 100) / 100).toString()).join(', ');

  return (
    <View
      style={{ height, borderRadius: 16, overflow: 'hidden', backgroundColor: colors.viewport, borderWidth: 1, borderColor: colors.border }}
      onLayout={(e) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
      {...pan.panHandlers}
      accessibilityLabel={`Viewport 3D. Posición ${fmt(estado.position)}. Rotación ${fmt(estado.rotation)} grados. Escala ${fmt(estado.scale)}.`}
    >
      <Svg width={size.w} height={size.h}>
        <G>
          {escena.grilla.map(([a, b, fuerte], i) => (
            <Line key={`g${i}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={fuerte ? colors.gridStrong : colors.grid} strokeWidth={1} />
          ))}
          {escena.ejes.map((e) => (
            <G key={e.label}>
              <Line x1={e.a.x} y1={e.a.y} x2={e.b.x} y2={e.b.y} stroke={e.color} strokeWidth={1.6} strokeOpacity={0.75} />
              <SvgText x={e.fin.x} y={e.fin.y} fill={e.color} fontSize={12} fontWeight="bold" textAnchor="middle">{e.label}</SvgText>
            </G>
          ))}
          {escena.fantasma?.map(([a, b], i) => (
            <Line key={`f${i}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={colors.ai} strokeWidth={1.6} strokeDasharray="5,4" strokeOpacity={0.9} />
          ))}
          <Circle cx={escena.sombra.x} cy={escena.sombra.y} r={3} fill={colors.textMuted} opacity={0.5} />
          {escena.caras.map((f, i) => (
            <Polygon key={`c${i}`} points={f.puntos} fill={f.fill} fillOpacity={0.93} stroke="#C7D2FE" strokeOpacity={0.55} strokeWidth={1.1} strokeLinejoin="round" />
          ))}
          {!compacto && escena.gizmo.map((g, i) => (
            <Line key={`z${i}`} x1={g.a.x} y1={g.a.y} x2={g.b.x} y2={g.b.y} stroke={g.color} strokeWidth={2.4} strokeLinecap="round" />
          ))}
          <Circle cx={escena.centro.x} cy={escena.centro.y} r={3.5} fill="#FFFFFF" stroke={colors.primary} strokeWidth={1.5} />
        </G>
      </Svg>

      {!compacto && (
        <>
          <View style={[styles.hud, { backgroundColor: colors.overlay }]} pointerEvents="none">
            <Text style={[styles.hudText, { color: '#E5E7EB' }]}>T  {fmt(estado.position)}</Text>
            <Text style={[styles.hudText, { color: '#E5E7EB' }]}>R  {fmt(estado.rotation)}°</Text>
            <Text style={[styles.hudText, { color: '#E5E7EB' }]}>S  {fmt(estado.scale)}</Text>
          </View>
          <View style={styles.botones}>
            <BotonVista icon="add" onPress={() => setCam((c) => ({ ...c, distancia: Math.max(5, c.distancia - 1.5) }))} label="Acercar" />
            <BotonVista icon="remove" onPress={() => setCam((c) => ({ ...c, distancia: Math.min(24, c.distancia + 1.5) }))} label="Alejar" />
            <BotonVista icon={orto ? 'grid-outline' : 'cube-outline'} onPress={() => setOrto((o) => !o)} label={orto ? 'Vista perspectiva' : 'Vista ortográfica'} />
            <BotonVista icon="locate-outline" onPress={() => setCam(CAM_INICIAL)} label="Centrar cámara" />
          </View>
          {objetivo ? (
            <View style={[styles.leyenda, { backgroundColor: colors.overlay }]} pointerEvents="none">
              <View style={{ width: 14, borderTopWidth: 2, borderStyle: 'dashed', borderColor: colors.ai }} />
              <Text style={{ color: '#E5E7EB', fontSize: 11 }}>Objetivo</Text>
            </View>
          ) : null}
          <Text style={[styles.modo, { color: colors.textMuted }]} pointerEvents="none">{orto ? 'ORTO' : 'PERSP'} · arrastrá para orbitar</Text>
        </>
      )}
    </View>
  );
}

function BotonVista({ icon, onPress, label }) {
  const { colors } = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityLabel={label} hitSlop={4} style={({ pressed }) => [styles.boton, { backgroundColor: colors.card + 'E6', borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}>
      <Ionicons name={icon} size={17} color={colors.text} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hud: { position: 'absolute', top: 10, left: 10, paddingHorizontal: 9, paddingVertical: 6, borderRadius: 10 },
  hudText: { fontSize: 11, fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }), lineHeight: 15 },
  botones: { position: 'absolute', right: 10, top: 10, gap: 8 },
  boton: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  leyenda: { position: 'absolute', left: 10, bottom: 10, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  modo: { position: 'absolute', right: 12, bottom: 8, fontSize: 10, letterSpacing: 0.5 },
});

export default memo(Viewport3D);

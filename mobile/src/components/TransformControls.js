// Controles manuales TRS: pestañas Traslación / Rotación / Escala, y por cada eje
// botones -/+ (paso configurable) y un slider para ajuste fino.
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import Slider from '@react-native-community/slider';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { Segmented, T, vibrar } from './ui';

const MODOS = {
  move: { key: 'position', label: 'Mover', icon: 'move-outline', paso: 0.5, min: -8, max: 8, sliderPaso: 0.1, unidad: 'u' },
  rotate: { key: 'rotation', label: 'Rotar', icon: 'refresh-outline', paso: 15, min: -180, max: 180, sliderPaso: 5, unidad: '°' },
  scale: { key: 'scale', label: 'Escalar', icon: 'resize-outline', paso: 0.25, min: 0.1, max: 5, sliderPaso: 0.05, unidad: '×' },
};
const EJES = ['X', 'Y', 'Z'];
const redondear = (n, paso) => Math.round(n / paso) * paso;
const r3 = (n) => Math.round(n * 1000) / 1000;

export default function TransformControls({ estado, onChange, onReset }) {
  const { colors } = useTheme();
  const [modo, setModo] = useState('move');
  const m = MODOS[modo];
  const colorEje = [colors.axisX, colors.axisY, colors.axisZ];

  const setValor = (i, v) => {
    const nuevo = { position: [...estado.position], rotation: [...estado.rotation], scale: [...estado.scale] };
    let val = Math.max(m.min, Math.min(m.max, v));
    if (modo === 'rotate') val = ((((val + 180) % 360) + 360) % 360) - 180;
    nuevo[m.key][i] = r3(val);
    onChange(nuevo);
  };

  return (
    <View style={{ backgroundColor: colors.card, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: colors.border, gap: 12 }}>
      <Segmented
        value={modo}
        onChange={setModo}
        options={Object.entries(MODOS).map(([value, o]) => ({ value, label: o.label, icon: o.icon }))}
      />
      {EJES.map((eje, i) => {
        const valor = estado[m.key][i];
        return (
          <View key={eje} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{ width: 26, height: 26, borderRadius: 8, backgroundColor: colorEje[i] + '26', alignItems: 'center', justifyContent: 'center' }}>
              <T weight="800" size={13} color={colorEje[i]}>{eje}</T>
            </View>
            <PasoBoton icon="remove" color={colorEje[i]} onPress={() => setValor(i, valor - m.paso)} label={`Restar ${m.paso} en ${eje}`} />
            <Slider
              style={{ flex: 1, height: 36 }}
              minimumValue={m.min}
              maximumValue={m.max}
              step={m.sliderPaso}
              value={Math.max(m.min, Math.min(m.max, valor))}
              onValueChange={(v) => setValor(i, redondear(v, m.sliderPaso))}
              minimumTrackTintColor={colorEje[i]}
              maximumTrackTintColor={colors.border}
              thumbTintColor={colorEje[i]}
              accessibilityLabel={`${m.label} en eje ${eje}`}
            />
            <PasoBoton icon="add" color={colorEje[i]} onPress={() => setValor(i, valor + m.paso)} label={`Sumar ${m.paso} en ${eje}`} />
            <T size={13} weight="700" style={{ width: 54, textAlign: 'right', fontVariant: ['tabular-nums'] }}>
              {Math.round(valor * 100) / 100}{m.unidad}
            </T>
          </View>
        );
      })}
      {onReset ? (
        <Pressable onPress={() => { vibrar(); onReset(); }} style={{ flexDirection: 'row', alignSelf: 'center', alignItems: 'center', gap: 6, padding: 4 }}>
          <Ionicons name="refresh-circle-outline" size={17} color={colors.textMuted} />
          <T muted size={13}>Restablecer al estado inicial</T>
        </Pressable>
      ) : null}
    </View>
  );
}

function PasoBoton({ icon, color, onPress, label }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={() => { vibrar(); onPress(); }}
      accessibilityLabel={label}
      hitSlop={6}
      style={({ pressed }) => ({ width: 32, height: 32, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: pressed ? color + '33' : colors.cardAlt, alignItems: 'center', justifyContent: 'center' })}
    >
      <Ionicons name={icon} size={17} color={colors.text} />
    </Pressable>
  );
}

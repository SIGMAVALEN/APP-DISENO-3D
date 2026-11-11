// Componentes visuales reutilizables con la "Estética 3D Studio".
import { forwardRef, useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, Animated, Image, KeyboardAvoidingView, Modal, Platform, Pressable,
  ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../context/ThemeContext';
import { radius } from '../theme/colors';

export const vibrar = (tipo = 'light') => {
  if (Platform.OS === 'web') return;
  if (tipo === 'success') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  else if (tipo === 'error') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
  else Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
};

export function T({ style, muted, size = 15, weight = '400', color, center, children, ...rest }) {
  const { colors } = useTheme();
  return (
    <Text
      style={[{ color: color || (muted ? colors.textMuted : colors.text), fontSize: size, fontWeight: weight, textAlign: center ? 'center' : undefined }, style]}
      {...rest}
    >
      {children}
    </Text>
  );
}

export const H1 = (p) => <T size={26} weight="800" {...p} />;
export const H2 = (p) => <T size={19} weight="700" {...p} />;

/** Contenedor de pantalla con scroll, fondo del tema y márgenes seguros. */
export function Screen({ children, scroll = true, padded = true, refreshControl, contentStyle, edges = ['top'] }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const pad = {
    paddingTop: edges.includes('top') ? insets.top + 12 : 12,
    paddingBottom: edges.includes('bottom') ? insets.bottom + 16 : 24,
    paddingHorizontal: padded ? 18 : 0,
  };
  if (!scroll) return <View style={[{ flex: 1, backgroundColor: colors.bg }, pad, contentStyle]}>{children}</View>;
  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={[pad, contentStyle]} keyboardShouldPersistTaps="handled" refreshControl={refreshControl}>
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

export function Card({ children, style, onPress, glow }) {
  const { colors } = useTheme();
  const base = [
    { backgroundColor: colors.card, borderRadius: radius.md, padding: 16, borderWidth: 1, borderColor: glow ? colors.primary : colors.border },
    style,
  ];
  if (!onPress) return <View style={base}>{children}</View>;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [...base, pressed && { opacity: 0.85, transform: [{ scale: 0.99 }] }]}>
      {children}
    </Pressable>
  );
}

export function Button({ title, onPress, variant = 'primary', icon, loading, disabled, style, small }) {
  const { colors } = useTheme();
  const v = {
    primary: { bg: colors.primary, fg: '#FFFFFF', border: colors.primary },
    ai: { bg: colors.ai, fg: '#FFFFFF', border: colors.ai },
    outline: { bg: 'transparent', fg: colors.text, border: colors.border },
    ghost: { bg: 'transparent', fg: colors.primary, border: 'transparent' },
    danger: { bg: colors.dangerSoft, fg: colors.danger, border: colors.dangerSoft },
  }[variant];
  const inactivo = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: inactivo, busy: loading }}
      disabled={inactivo}
      onPress={() => { vibrar(); onPress?.(); }}
      style={({ pressed }) => [
        {
          backgroundColor: v.bg, borderColor: v.border, borderWidth: 1, borderRadius: radius.md,
          paddingVertical: small ? 9 : 14, paddingHorizontal: small ? 14 : 18,
          flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
          opacity: inactivo ? 0.55 : pressed ? 0.85 : 1,
        },
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={v.fg} size="small" /> : icon ? <Ionicons name={icon} size={small ? 16 : 19} color={v.fg} /> : null}
      <Text style={{ color: v.fg, fontWeight: '700', fontSize: small ? 14 : 16 }}>{title}</Text>
    </Pressable>
  );
}

export const Input = forwardRef(function Input({ label, error, icon, secure, style, hint, ...rest }, ref) {
  const { colors } = useTheme();
  const [visible, setVisible] = useState(false);
  const [foco, setFoco] = useState(false);
  return (
    <View style={[{ marginBottom: 14 }, style]}>
      {label ? <T size={13} weight="600" muted style={{ marginBottom: 6 }}>{label}</T> : null}
      <View
        style={{
          flexDirection: 'row', alignItems: 'center', backgroundColor: colors.inputBg, borderRadius: radius.md - 4,
          borderWidth: 1.5, borderColor: error ? colors.danger : foco ? colors.primary : colors.border, paddingHorizontal: 12,
        }}
      >
        {icon ? <Ionicons name={icon} size={18} color={colors.textMuted} style={{ marginRight: 8 }} /> : null}
        <TextInput
          ref={ref}
          placeholderTextColor={colors.textMuted}
          secureTextEntry={secure && !visible}
          onFocus={() => setFoco(true)}
          onBlur={() => setFoco(false)}
          style={{ flex: 1, color: colors.text, fontSize: 15, paddingVertical: Platform.OS === 'ios' ? 13 : 10, ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : null) }}
          accessibilityLabel={label}
          {...rest}
        />
        {secure ? (
          <Pressable onPress={() => setVisible((x) => !x)} hitSlop={10} accessibilityLabel={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}>
            <Ionicons name={visible ? 'eye-off-outline' : 'eye-outline'} size={19} color={colors.textMuted} />
          </Pressable>
        ) : null}
      </View>
      {error ? <T size={12.5} color={colors.danger} style={{ marginTop: 5 }}>{error}</T> : hint ? <T size={12} muted style={{ marginTop: 5 }}>{hint}</T> : null}
    </View>
  );
});

export function Banner({ tipo = 'error', children, onClose }) {
  const { colors } = useTheme();
  const c = { error: [colors.dangerSoft, colors.danger, 'alert-circle'], ok: [colors.aiSoft, colors.ai, 'checkmark-circle'], info: [colors.primarySoft, colors.primary, 'information-circle'] }[tipo];
  return (
    <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center', backgroundColor: c[0], padding: 12, borderRadius: radius.sm + 2, marginBottom: 14 }}>
      <Ionicons name={c[2]} size={20} color={c[1]} />
      <T size={13.5} color={c[1]} style={{ flex: 1 }}>{children}</T>
      {onClose ? <Pressable onPress={onClose} hitSlop={10}><Ionicons name="close" size={18} color={c[1]} /></Pressable> : null}
    </View>
  );
}

/** Barra de progreso con animación fluida (XP). */
export function ProgressBar({ value, max = 1, color, height = 10, style }) {
  const { colors } = useTheme();
  const [anim] = useState(() => new Animated.Value(0));
  const pct = Math.max(0, Math.min(1, max ? value / max : 0));
  useEffect(() => {
    Animated.spring(anim, { toValue: pct, useNativeDriver: false, friction: 9, tension: 40 }).start();
  }, [pct, anim]);
  return (
    <View style={[{ height, backgroundColor: colors.cardAlt, borderRadius: height, overflow: 'hidden' }, style]}>
      <Animated.View
        style={{
          height: '100%', borderRadius: height, backgroundColor: color || colors.primary,
          width: anim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
        }}
      />
    </View>
  );
}

export function Chip({ label, color, icon, active, onPress, style }) {
  const { colors } = useTheme();
  const c = color || colors.primary;
  const Comp = onPress ? Pressable : View;
  return (
    <Comp
      onPress={onPress}
      style={[{
        flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill,
        backgroundColor: active === false ? 'transparent' : c + '22', borderWidth: 1, borderColor: active === false ? colors.border : c + '55',
      }, style]}
    >
      {icon ? <Ionicons name={icon} size={13} color={active === false ? colors.textMuted : c} /> : null}
      <Text style={{ color: active === false ? colors.textMuted : c, fontSize: 12.5, fontWeight: '700' }}>{label}</Text>
    </Comp>
  );
}

export const colorDificultad = (d, colors) => ({ 'Fácil': colors.ai, Medio: colors.warning, Avanzado: colors.danger }[d] || colors.primary);

export function Avatar({ uri, nombre = '?', size = 44 }) {
  const { colors } = useTheme();
  const iniciales = nombre.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();
  if (uri) return <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.cardAlt }} accessibilityLabel={`Foto de ${nombre}`} />;
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.primary + '66' }}>
      <Text style={{ color: colors.primary, fontWeight: '800', fontSize: size * 0.36 }}>{iniciales}</Text>
    </View>
  );
}

export function Loading({ texto = 'Cargando…' }) {
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, backgroundColor: colors.bg }}>
      <ActivityIndicator size="large" color={colors.primary} />
      <T muted style={{ marginTop: 12 }}>{texto}</T>
    </View>
  );
}

export function EstadoVacio({ icon = 'cube-outline', titulo, texto, accion }) {
  const { colors } = useTheme();
  return (
    <View style={{ alignItems: 'center', padding: 28, gap: 8 }}>
      <Ionicons name={icon} size={42} color={colors.textMuted} />
      <T weight="700" size={16} center>{titulo}</T>
      {texto ? <T muted center size={14}>{texto}</T> : null}
      {accion ? <View style={{ marginTop: 8 }}>{accion}</View> : null}
    </View>
  );
}

export function ErrorEstado({ error, onRetry }) {
  return (
    <EstadoVacio
      icon={error?.red ? 'cloud-offline-outline' : 'warning-outline'}
      titulo={error?.red ? 'Sin conexión' : 'Algo salió mal'}
      texto={error?.message}
      accion={onRetry ? <Button small variant="outline" icon="refresh" title="Reintentar" onPress={onRetry} /> : null}
    />
  );
}

/** Modal con efecto glassmorphism (desenfoque del fondo). */
export function GlassModal({ visible, onClose, children, dismissable = true }) {
  const { colors, modo } = useTheme();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={dismissable ? onClose : undefined} statusBarTranslucent>
      <BlurView intensity={40} tint={modo === 'dark' ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
      <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: colors.overlay }]} onPress={dismissable ? onClose : undefined} />
      <View style={{ flex: 1, justifyContent: 'center', padding: 22 }} pointerEvents="box-none">
        <View
          style={{
            backgroundColor: modo === 'dark' ? 'rgba(30,34,45,0.92)' : 'rgba(255,255,255,0.94)', borderRadius: radius.md + 4, padding: 22,
            borderWidth: 1, borderColor: modo === 'dark' ? 'rgba(255,255,255,0.08)' : colors.border,
          }}
        >
          {children}
        </View>
      </View>
    </Modal>
  );
}

export function Stars({ value = 0, onChange, size = 22 }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: 4 }} accessibilityRole="adjustable" accessibilityValue={{ now: value, min: 0, max: 5 }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Pressable key={n} disabled={!onChange} onPress={() => { vibrar(); onChange?.(n); }} hitSlop={4} accessibilityLabel={`${n} estrellas`}>
          <Ionicons name={n <= Math.round(value) ? 'star' : 'star-outline'} size={size} color={colors.warning} />
        </Pressable>
      ))}
    </View>
  );
}

export function Row({ children, style, gap = 10 }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap }, style]}>{children}</View>;
}

export function Segmented({ options, value, onChange }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', backgroundColor: colors.cardAlt, borderRadius: radius.sm + 2, padding: 3 }}>
      {options.map((o) => {
        const activo = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => { vibrar(); onChange(o.value); }}
            accessibilityRole="tab"
            accessibilityState={{ selected: activo }}
            style={{ flex: 1, paddingVertical: 8, borderRadius: radius.sm, backgroundColor: activo ? colors.card : 'transparent', alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 5 }}
          >
            {o.icon ? <Ionicons name={o.icon} size={15} color={activo ? o.color || colors.primary : colors.textMuted} /> : null}
            <Text style={{ color: activo ? o.color || colors.text : colors.textMuted, fontWeight: '700', fontSize: 13 }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function ListItem({ icon, titulo, subtitulo, onPress, derecha, color, peligro }) {
  const { colors } = useTheme();
  const c = peligro ? colors.danger : color || colors.text;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, opacity: pressed ? 0.6 : 1 })}>
      {icon ? (
        <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: peligro ? colors.dangerSoft : colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name={icon} size={18} color={peligro ? colors.danger : colors.primary} />
        </View>
      ) : null}
      <View style={{ flex: 1 }}>
        <T weight="600" color={c}>{titulo}</T>
        {subtitulo ? <T muted size={12.5}>{subtitulo}</T> : null}
      </View>
      {derecha !== undefined ? derecha : onPress ? <Ionicons name="chevron-forward" size={18} color={colors.textMuted} /> : null}
    </Pressable>
  );
}

export const Divider = () => {
  const { colors } = useTheme();
  return <View style={{ height: 1, backgroundColor: colors.border }} />;
};

/** Formatea fechas SQLite ("YYYY-MM-DD HH:MM:SS", en UTC) en hora local. */
export function fechaRelativa(s) {
  if (!s) return '';
  const d = new Date(String(s).replace(' ', 'T') + (String(s).includes('Z') ? '' : 'Z'));
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return 'recién';
  if (diff < 3600) return `hace ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `hace ${Math.floor(diff / 3600)} h`;
  if (diff < 86400 * 7) return `hace ${Math.floor(diff / 86400)} d`;
  return d.toLocaleDateString('es-AR');
}

/** Diálogo de confirmación multiplataforma (Alert con botones no existe en web). */
export function confirmar(titulo, mensaje, textoOk = 'Aceptar', destructivo = false) {
  if (Platform.OS === 'web') return Promise.resolve(window.confirm(`${titulo}\n\n${mensaje}`));
  return new Promise((resolve) => {
    Alert.alert(titulo, mensaje, [
      { text: 'Cancelar', style: 'cancel', onPress: () => resolve(false) },
      { text: textoOk, style: destructivo ? 'destructive' : 'default', onPress: () => resolve(true) },
    ], { cancelable: true, onDismiss: () => resolve(false) });
  });
}

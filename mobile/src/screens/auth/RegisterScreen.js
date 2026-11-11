import { useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { Banner, Button, H1, Input, ProgressBar, Screen, T } from '../../components/ui';
import { fuerzaPassword, validarEmail, validarNombre, validarPassword } from '../../lib/validaciones';

export default function RegisterScreen({ navigation }) {
  const { colors } = useTheme();
  const { register } = useAuth();
  const [form, setForm] = useState({ nombre: '', email: '', password: '', confirmar: '' });
  const [errores, setErrores] = useState({});
  const [error, setError] = useState(null);
  const [cargando, setCargando] = useState(false);
  const emailRef = useRef(null);
  const passRef = useRef(null);
  const confRef = useRef(null);

  const set = (k) => (v) => { setForm((f) => ({ ...f, [k]: v })); setErrores((e) => ({ ...e, [k]: null })); };
  const fuerza = fuerzaPassword(form.password);
  const coloresFuerza = [colors.danger, colors.danger, colors.warning, colors.ai, colors.ai];

  const enviar = async () => {
    const e = {};
    const n = validarNombre(form.nombre); if (n) e.nombre = n;
    if (!validarEmail(form.email)) e.email = 'Ingresá un email válido';
    const p = validarPassword(form.password); if (p) e.password = p;
    if (form.confirmar !== form.password) e.confirmar = 'Las contraseñas no coinciden';
    setErrores(e);
    setError(null);
    if (Object.keys(e).length) return;
    setCargando(true);
    try {
      await register(form.nombre.trim(), form.email.trim(), form.password);
    } catch (err) {
      setError(err.message);
      if (err.campos) setErrores(err.campos);
    } finally {
      setCargando(false);
    }
  };

  return (
    <Screen edges={['bottom']}>
      <H1 style={{ marginBottom: 4 }}>Creá tu cuenta</H1>
      <T muted style={{ marginBottom: 22 }}>Empezás como Novato 3D. ¡A sumar XP!</T>
      {error ? <Banner onClose={() => setError(null)}>{error}</Banner> : null}

      <Input label="Nombre" icon="person-outline" value={form.nombre} onChangeText={set('nombre')} error={errores.nombre} autoComplete="name" returnKeyType="next" onSubmitEditing={() => emailRef.current?.focus()} placeholder="Tu nombre" />
      <Input ref={emailRef} label="Email" icon="mail-outline" value={form.email} onChangeText={set('email')} error={errores.email} autoCapitalize="none" keyboardType="email-address" autoComplete="email" returnKeyType="next" onSubmitEditing={() => passRef.current?.focus()} placeholder="vos@email.com" />
      <Input ref={passRef} label="Contraseña" icon="lock-closed-outline" secure value={form.password} onChangeText={set('password')} error={errores.password} autoComplete="new-password" textContentType="newPassword" returnKeyType="next" onSubmitEditing={() => confRef.current?.focus()} hint="Mínimo 8 caracteres, con letras y números" style={{ marginBottom: 6 }} />
      {form.password ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <ProgressBar value={fuerza} max={4} color={coloresFuerza[fuerza]} height={5} style={{ flex: 1 }} />
          <T size={12} muted>{['Muy débil', 'Débil', 'Aceptable', 'Buena', 'Excelente'][fuerza]}</T>
        </View>
      ) : <View style={{ height: 8 }} />}
      <Input ref={confRef} label="Confirmar contraseña" icon="shield-checkmark-outline" secure value={form.confirmar} onChangeText={set('confirmar')} error={errores.confirmar} returnKeyType="go" onSubmitEditing={enviar} />

      <Button title="Crear cuenta" icon="person-add-outline" onPress={enviar} loading={cargando} style={{ marginTop: 6 }} />
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 22 }}>
        <T muted>¿Ya tenés cuenta?</T>
        <Pressable onPress={() => navigation.goBack()} hitSlop={8}><T color={colors.primary} weight="700">Iniciá sesión</T></Pressable>
      </View>
    </Screen>
  );
}

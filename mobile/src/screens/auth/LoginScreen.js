import { useEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { ping } from '../../api/client';
import { Banner, Button, H1, Input, Screen, T } from '../../components/ui';
import { validarEmail } from '../../lib/validaciones';

export function Logo({ size = 64 }) {
  return (
    <LinearGradient colors={['#6366F1', '#10B981']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ width: size, height: size, borderRadius: size * 0.3, alignItems: 'center', justifyContent: 'center' }}>
      <Ionicons name="cube" size={size * 0.55} color="#fff" />
    </LinearGradient>
  );
}

export default function LoginScreen({ navigation }) {
  const { colors } = useTheme();
  const { login, loginGoogle, googleDisponible, avisoSesion, limpiarAviso } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errores, setErrores] = useState({});
  const [error, setError] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [cargandoGoogle, setCargandoGoogle] = useState(false);
  const [despertando, setDespertando] = useState(false);
  const passRef = useRef(null);

  // Render free "duerme": lo despertamos apenas se abre el login.
  useEffect(() => {
    const t = setTimeout(() => setDespertando(true), 2500);
    ping().finally(() => { clearTimeout(t); setDespertando(false); });
    return () => clearTimeout(t);
  }, []);

  const enviar = async () => {
    const e = {};
    if (!validarEmail(email)) e.email = 'Ingresá un email válido';
    if (!password) e.password = 'Ingresá tu contraseña';
    setErrores(e);
    setError(null);
    if (Object.keys(e).length) return;
    setCargando(true);
    try {
      await login(email.trim(), password);
    } catch (err) {
      setError(err.message);
      if (err.campos) setErrores(err.campos);
    } finally {
      setCargando(false);
    }
  };

  const google = async () => {
    setError(null);
    setCargandoGoogle(true);
    try {
      await loginGoogle();
    } catch (err) {
      setError(err.message || 'No se pudo iniciar sesión con Google');
    } finally {
      setCargandoGoogle(false);
    }
  };

  return (
    <Screen contentStyle={{ flexGrow: 1, justifyContent: 'center' }} edges={['top', 'bottom']}>
      <View style={{ alignItems: 'center', marginBottom: 28, gap: 12 }}>
        <Logo size={72} />
        <H1>BlendGO!</H1>
        <T muted center>Aprendé modelado 3D jugando, con un tutor IA a tu lado.</T>
      </View>

      {avisoSesion ? <Banner tipo="info" onClose={limpiarAviso}>{avisoSesion}</Banner> : null}
      {despertando ? <Banner tipo="info">Conectando con el servidor… la primera vez puede tardar hasta un minuto.</Banner> : null}
      {error ? <Banner onClose={() => setError(null)}>{error}</Banner> : null}

      <Input
        label="Email"
        icon="mail-outline"
        value={email}
        onChangeText={(t) => { setEmail(t); setErrores((x) => ({ ...x, email: null })); }}
        error={errores.email}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        textContentType="emailAddress"
        returnKeyType="next"
        onSubmitEditing={() => passRef.current?.focus()}
        placeholder="vos@email.com"
      />
      <Input
        ref={passRef}
        label="Contraseña"
        icon="lock-closed-outline"
        secure
        value={password}
        onChangeText={(t) => { setPassword(t); setErrores((x) => ({ ...x, password: null })); }}
        error={errores.password}
        autoComplete="current-password"
        textContentType="password"
        returnKeyType="go"
        onSubmitEditing={enviar}
        placeholder="••••••••"
      />
      <Pressable onPress={() => navigation.navigate('Forgot', { email })} style={{ alignSelf: 'flex-end', marginBottom: 18 }} hitSlop={8}>
        <T color={colors.primary} weight="600" size={14}>¿Olvidaste tu contraseña?</T>
      </Pressable>

      <Button title="Iniciar sesión" icon="log-in-outline" onPress={enviar} loading={cargando} />

      {googleDisponible ? (
        <>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 18 }}>
            <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
            <T muted size={13}>o</T>
            <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
          </View>
          <Button title="Continuar con Google" icon="logo-google" variant="outline" onPress={google} loading={cargandoGoogle} />
        </>
      ) : null}

      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 26 }}>
        <T muted>¿No tenés cuenta?</T>
        <Pressable onPress={() => navigation.navigate('Register')} hitSlop={8}>
          <T color={colors.primary} weight="700">Creá una</T>
        </Pressable>
      </View>
    </Screen>
  );
}

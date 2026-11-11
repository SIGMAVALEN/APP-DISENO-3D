// Recuperar contraseña (paso 1: pedir código por email) y
// restablecerla (paso 2: código de 6 dígitos + nueva contraseña).
import { useState } from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { Banner, Button, H1, Input, Screen, T } from '../../components/ui';
import { validarEmail, validarPassword } from '../../lib/validaciones';

export default function ForgotPasswordScreen({ route }) {
  const { colors } = useTheme();
  const { resetPassword } = useAuth();
  const [paso, setPaso] = useState(1);
  const [email, setEmail] = useState(route.params?.email || '');
  const [codigo, setCodigo] = useState('');
  const [password, setPassword] = useState('');
  const [errores, setErrores] = useState({});
  const [error, setError] = useState(null);
  const [info, setInfo] = useState(null);
  const [cargando, setCargando] = useState(false);

  const pedirCodigo = async () => {
    if (!validarEmail(email)) return setErrores({ email: 'Ingresá un email válido' });
    setErrores({}); setError(null); setCargando(true);
    try {
      const r = await api('/auth/forgot', { method: 'POST', body: { email: email.trim() }, auth: false });
      setInfo(r.codigoDemo ? `${r.mensaje} (Modo demo: tu código es ${r.codigoDemo})` : r.mensaje);
      setPaso(2);
    } catch (e) {
      setError(e.message);
    } finally {
      setCargando(false);
    }
  };

  const restablecer = async () => {
    const e = {};
    if (!/^\d{6}$/.test(codigo)) e.codigo = 'El código tiene 6 dígitos';
    const p = validarPassword(password); if (p) e.password = p;
    setErrores(e); setError(null);
    if (Object.keys(e).length) return;
    setCargando(true);
    try {
      await resetPassword(email.trim(), codigo, password); // inicia sesión automáticamente
    } catch (err) {
      setError(err.message);
      if (err.campos) setErrores(err.campos);
    } finally {
      setCargando(false);
    }
  };

  return (
    <Screen edges={['bottom']}>
      <View style={{ width: 56, height: 56, borderRadius: 18, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
        <Ionicons name={paso === 1 ? 'key-outline' : 'mail-open-outline'} size={28} color={colors.primary} />
      </View>
      <H1 style={{ marginBottom: 6 }}>{paso === 1 ? 'Recuperar contraseña' : 'Restablecer contraseña'}</H1>
      <T muted style={{ marginBottom: 22 }}>
        {paso === 1 ? 'Te enviamos un código de 6 dígitos a tu email. Vence en 15 minutos.' : `Ingresá el código que enviamos a ${email} y elegí una nueva contraseña.`}
      </T>
      {info && paso === 2 ? <Banner tipo="ok">{info}</Banner> : null}
      {error ? <Banner onClose={() => setError(null)}>{error}</Banner> : null}

      {paso === 1 ? (
        <>
          <Input label="Email" icon="mail-outline" value={email} onChangeText={setEmail} error={errores.email} autoCapitalize="none" keyboardType="email-address" autoComplete="email" returnKeyType="send" onSubmitEditing={pedirCodigo} />
          <Button title="Enviar código" icon="send-outline" onPress={pedirCodigo} loading={cargando} />
        </>
      ) : (
        <>
          <Input label="Código" icon="keypad-outline" value={codigo} onChangeText={(t) => setCodigo(t.replace(/\D/g, '').slice(0, 6))} error={errores.codigo} keyboardType="number-pad" autoComplete="one-time-code" textContentType="oneTimeCode" placeholder="000000" maxLength={6} />
          <Input label="Nueva contraseña" icon="lock-closed-outline" secure value={password} onChangeText={setPassword} error={errores.password} autoComplete="new-password" hint="Mínimo 8 caracteres, con letras y números" returnKeyType="go" onSubmitEditing={restablecer} />
          <Button title="Restablecer y entrar" icon="checkmark-circle-outline" onPress={restablecer} loading={cargando} />
          <Button title="Reenviar código" variant="ghost" onPress={pedirCodigo} disabled={cargando} style={{ marginTop: 8 }} />
        </>
      )}
    </Screen>
  );
}

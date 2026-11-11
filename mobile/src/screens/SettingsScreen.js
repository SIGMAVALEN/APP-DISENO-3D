// Configuración básica de la cuenta: datos personales, foto, tema, notificaciones,
// cambio de contraseña, cerrar sesión en todos los dispositivos y eliminar cuenta.
import { useState } from 'react';
import { Pressable, Switch, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import Constants from 'expo-constants';
import { Ionicons } from '@expo/vector-icons';
import { api, API_URL } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { configurarRecordatorioDiario } from '../lib/notifications';
import { validarNombre, validarPassword } from '../lib/validaciones';
import { Avatar, Banner, Button, Card, confirmar, Divider, GlassModal, H2, Input, ListItem, Row, Screen, Segmented, T } from '../components/ui';

export default function SettingsScreen() {
  const { colors, preferencia, setPreferencia } = useTheme();
  const { usuario, setUsuario, reemplazarSesion, purgarSesion, logout } = useAuth();
  const [nombre, setNombre] = useState(usuario.nombre);
  const [msg, setMsg] = useState(null);
  const [guardando, setGuardando] = useState(null);
  const [pass, setPass] = useState({ actual: '', nueva: '', confirmar: '' });
  const [errPass, setErrPass] = useState({});
  const [borrar, setBorrar] = useState(false);

  const patch = async (body, clave) => {
    setGuardando(clave);
    setMsg(null);
    try {
      const r = await api('/me', { method: 'PATCH', body });
      setUsuario(r.usuario);
      return true;
    } catch (e) {
      setMsg({ tipo: 'error', texto: e.message });
      return false;
    } finally {
      setGuardando(null);
    }
  };

  const guardarNombre = async () => {
    const e = validarNombre(nombre);
    if (e) return setMsg({ tipo: 'error', texto: `Nombre: ${e}` });
    if (await patch({ nombre: nombre.trim() }, 'nombre')) setMsg({ tipo: 'ok', texto: 'Datos actualizados' });
  };

  const elegirFoto = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return setMsg({ tipo: 'error', texto: 'Necesitamos permiso para acceder a tus fotos.' });
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 1 });
    if (r.canceled) return;
    try {
      setGuardando('foto');
      // Redimensionamos a 256 px y comprimimos para guardarla liviana en la base.
      const ref = await ImageManipulator.manipulate(r.assets[0].uri).resize({ width: 256, height: 256 }).renderAsync();
      const img = await ref.saveAsync({ base64: true, compress: 0.7, format: SaveFormat.JPEG });
      if (await patch({ avatar: `data:image/jpeg;base64,${img.base64}` }, 'foto')) setMsg({ tipo: 'ok', texto: 'Foto actualizada' });
    } catch {
      setMsg({ tipo: 'error', texto: 'No se pudo procesar la imagen' });
    } finally {
      setGuardando(null);
    }
  };

  const cambiarTema = (t) => {
    setPreferencia(t);
    api('/me', { method: 'PATCH', body: { tema: t } }).then((r) => setUsuario(r.usuario)).catch(() => {});
  };

  const cambiarNotif = async (v) => {
    if (await patch({ notifActivas: v }, 'notif')) configurarRecordatorioDiario(v);
  };

  const cambiarPassword = async () => {
    const e = {};
    if (usuario.tienePassword && !pass.actual) e.actual = 'Ingresá tu contraseña actual';
    const p = validarPassword(pass.nueva); if (p) e.nueva = p;
    if (pass.nueva !== pass.confirmar) e.confirmar = 'No coinciden';
    setErrPass(e);
    if (Object.keys(e).length) return;
    setGuardando('pass');
    setMsg(null);
    try {
      const r = await api('/me/password', { method: 'POST', body: { actual: pass.actual || undefined, nueva: pass.nueva } });
      await reemplazarSesion(r);
      setPass({ actual: '', nueva: '', confirmar: '' });
      setMsg({ tipo: 'ok', texto: 'Contraseña actualizada. Cerramos tus otras sesiones por seguridad.' });
    } catch (err) {
      if (err.campos) setErrPass(err.campos);
      setMsg({ tipo: 'error', texto: err.message });
    } finally {
      setGuardando(null);
    }
  };

  const cerrarTodas = async () => {
    if (!(await confirmar('Cerrar todas las sesiones', 'Se cerrará la sesión en todos tus dispositivos, incluido este.', 'Cerrar todas', true))) return;
    try {
      await api('/auth/logout-all', { method: 'POST' });
    } catch (e) {
      return setMsg({ tipo: 'error', texto: e.message });
    }
    await purgarSesion();
  };

  return (
    <Screen edges={['bottom']}>
      {msg ? <Banner tipo={msg.tipo} onClose={() => setMsg(null)}>{msg.texto}</Banner> : null}

      <H2 style={{ marginBottom: 10 }}>Mis datos</H2>
      <Card style={{ marginBottom: 20 }}>
        <Row style={{ marginBottom: 16 }} gap={14}>
          <Pressable onPress={elegirFoto} accessibilityLabel="Cambiar foto de perfil">
            <Avatar uri={usuario.avatar} nombre={usuario.nombre} size={64} />
            <View style={{ position: 'absolute', right: -2, bottom: -2, width: 24, height: 24, borderRadius: 12, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.card }}>
              <Ionicons name="camera" size={12} color="#fff" />
            </View>
          </Pressable>
          <View style={{ flex: 1 }}>
            <T weight="700">{usuario.email}</T>
            <T muted size={12.5}>{usuario.tieneGoogle ? 'Vinculada con Google' : 'Cuenta con email'} · desde {String(usuario.creadoEn || '').slice(0, 10)}</T>
            {usuario.avatar ? <Pressable onPress={() => patch({ avatar: null }, 'foto')}><T size={12.5} color={colors.danger} style={{ marginTop: 4 }}>Quitar foto</T></Pressable> : null}
          </View>
        </Row>
        <Input label="Nombre" icon="person-outline" value={nombre} onChangeText={setNombre} maxLength={60} />
        <Button title="Guardar cambios" small onPress={guardarNombre} loading={guardando === 'nombre' || guardando === 'foto'} disabled={nombre.trim() === usuario.nombre} />
      </Card>

      <H2 style={{ marginBottom: 10 }}>Preferencias</H2>
      <Card style={{ marginBottom: 20, gap: 12 }}>
        <T weight="600">Tema</T>
        <Segmented
          value={preferencia}
          onChange={cambiarTema}
          options={[
            { value: 'system', label: 'Sistema', icon: 'phone-portrait-outline' },
            { value: 'light', label: 'Claro', icon: 'sunny-outline' },
            { value: 'dark', label: 'Oscuro', icon: 'moon-outline' },
          ]}
        />
        <Divider />
        <Row style={{ justifyContent: 'space-between' }}>
          <View style={{ flex: 1 }}>
            <T weight="600">Notificaciones</T>
            <T muted size={12.5}>Nuevos ejercicios, respuestas, logros y recordatorio diario</T>
          </View>
          <Switch
            value={usuario.notifActivas}
            onValueChange={cambiarNotif}
            disabled={guardando === 'notif'}
            trackColor={{ true: colors.ai, false: colors.border }}
            thumbColor="#fff"
            accessibilityLabel="Activar notificaciones"
          />
        </Row>
      </Card>

      <H2 style={{ marginBottom: 10 }}>{usuario.tienePassword ? 'Cambiar contraseña' : 'Crear contraseña'}</H2>
      <Card style={{ marginBottom: 20 }}>
        {!usuario.tienePassword ? <T muted size={13} style={{ marginBottom: 12 }}>Entraste con Google. Podés crear una contraseña para iniciar sesión también con email.</T> : null}
        {usuario.tienePassword ? (
          <Input label="Contraseña actual" secure value={pass.actual} onChangeText={(v) => setPass((p) => ({ ...p, actual: v }))} error={errPass.actual} autoComplete="current-password" />
        ) : null}
        <Input label="Nueva contraseña" secure value={pass.nueva} onChangeText={(v) => setPass((p) => ({ ...p, nueva: v }))} error={errPass.nueva} autoComplete="new-password" hint="Mínimo 8 caracteres, con letras y números" />
        <Input label="Repetir nueva contraseña" secure value={pass.confirmar} onChangeText={(v) => setPass((p) => ({ ...p, confirmar: v }))} error={errPass.confirmar} />
        <Button title="Actualizar contraseña" small icon="key-outline" onPress={cambiarPassword} loading={guardando === 'pass'} />
      </Card>

      <H2 style={{ marginBottom: 10 }}>Sesión y seguridad</H2>
      <Card style={{ paddingVertical: 4, marginBottom: 20 }}>
        <ListItem icon="log-out-outline" titulo="Cerrar sesión" onPress={logout} />
        <Divider />
        <ListItem icon="phone-portrait-outline" titulo="Cerrar sesión en todos los dispositivos" onPress={cerrarTodas} />
        <Divider />
        <ListItem icon="trash-outline" titulo="Eliminar mi cuenta" subtitulo="Borra tu progreso de forma permanente" peligro onPress={() => setBorrar(true)} />
      </Card>

      <T muted size={11.5} center>BlendGO! v{Constants.expoConfig?.version} · Servidor: {API_URL.replace(/^https?:\/\//, '')}</T>

      <ModalBorrar visible={borrar} onClose={() => setBorrar(false)} necesitaPassword={usuario.tienePassword} onBorrada={purgarSesion} />
    </Screen>
  );
}

function ModalBorrar({ visible, onClose, necesitaPassword, onBorrada }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [cargando, setCargando] = useState(false);
  const borrar = async () => {
    setCargando(true);
    setError(null);
    try {
      await api('/me', { method: 'DELETE', body: necesitaPassword ? { password } : {} });
      onClose();
      await onBorrada();
    } catch (e) {
      setError(e.message);
    } finally {
      setCargando(false);
    }
  };
  return (
    <GlassModal visible={visible} onClose={onClose}>
      <H2 style={{ marginBottom: 6 }}>Eliminar cuenta</H2>
      <T muted style={{ marginBottom: 16 }}>Se borrarán tu progreso, XP, insignias y comentarios. Esta acción no se puede deshacer.</T>
      {error ? <Banner>{error}</Banner> : null}
      {necesitaPassword ? <Input label="Confirmá con tu contraseña" secure value={password} onChangeText={setPassword} /> : null}
      <View style={{ gap: 10 }}>
        <Button title="Eliminar definitivamente" variant="danger" icon="trash-outline" onPress={borrar} loading={cargando} disabled={necesitaPassword && !password} />
        <Button title="Cancelar" variant="outline" onPress={onClose} />
      </View>
    </GlassModal>
  );
}

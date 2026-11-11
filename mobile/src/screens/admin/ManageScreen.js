// "Aportar": cualquier usuario crea, edita y borra SUS ejercicios (como un repo en GitHub).
// El superadmin además ve Categorías y Usuarios, y puede borrar ejercicios de otros (moderación).
// La app oculta las opciones según el rol, pero los permisos reales se validan en el backend.
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { useApi } from '../../lib/useApi';
import { esSuper, ROL_LABEL } from '../../lib/roles';
import {
  Avatar, Banner, Button, Card, Chip, colorDificultad, confirmar, ErrorEstado, EstadoVacio, GlassModal, H1, H2, Input, Loading, Row, Screen, Segmented, T,
} from '../../components/ui';

export default function ManageScreen({ navigation }) {
  const { usuario } = useAuth();
  const [seccion, setSeccion] = useState('ejercicios');
  const opciones = [
    { value: 'ejercicios', label: 'Ejercicios', icon: 'cube-outline' },
    ...(esSuper(usuario)
      ? [
          { value: 'categorias', label: 'Categorías', icon: 'folder-outline' },
          { value: 'usuarios', label: 'Usuarios', icon: 'people-outline' },
        ]
      : []),
  ];
  return (
    <Screen>
      <H1>Aportar</H1>
      <T muted style={{ marginBottom: 14 }}>
        {esSuper(usuario)
          ? 'Sos superadmin: además de aportar, podés moderar ejercicios, categorías y usuarios.'
          : 'Creá ejercicios para la comunidad. Solo vos podés editar o borrar los tuyos.'}
      </T>
      {opciones.length > 1 ? <Segmented options={opciones} value={seccion} onChange={setSeccion} /> : null}
      <View style={{ height: 16 }} />
      {seccion === 'ejercicios' ? <Ejercicios navigation={navigation} /> : null}
      {seccion === 'categorias' ? <Categorias /> : null}
      {seccion === 'usuarios' ? <Usuarios /> : null}
    </Screen>
  );
}

function Ejercicios({ navigation }) {
  const { colors } = useTheme();
  const { usuario } = useAuth();
  const [soloMios, setSoloMios] = useState(true);
  const { data, error, cargando, recargar } = useApi(`/ejercicios${soloMios ? '?mios=1' : ''}`);
  const [msg, setMsg] = useState(null);

  const borrar = async (e) => {
    const mio = e.creadoPor === usuario.id;
    const aviso = mio
      ? `¿Eliminar "${e.titulo}"? También se borra el progreso y los comentarios asociados.`
      : `Vas a eliminar "${e.titulo}" de ${e.autor || 'otro usuario'} como moderación. Se le va a avisar con una notificación.`;
    if (!(await confirmar(mio ? 'Eliminar ejercicio' : 'Moderar ejercicio', aviso, 'Eliminar', true))) return;
    try {
      await api(`/ejercicios/${e.id}`, { method: 'DELETE' });
      setMsg({ tipo: 'ok', texto: 'Ejercicio eliminado' });
      recargar();
    } catch (err) {
      setMsg({ tipo: 'error', texto: err.message });
    }
  };

  return (
    <View>
      <Button title="Nuevo ejercicio" icon="add-circle-outline" onPress={() => navigation.navigate('FormEjercicio')} style={{ marginBottom: 12 }} />
      <Row style={{ marginBottom: 12 }} gap={8}>
        <Chip label="Míos" active={soloMios} onPress={() => setSoloMios(true)} />
        <Chip label="Todos" active={!soloMios} onPress={() => setSoloMios(false)} />
      </Row>
      {msg ? <Banner tipo={msg.tipo} onClose={() => setMsg(null)}>{msg.texto}</Banner> : null}
      {cargando ? <Loading /> : null}
      {error && !data ? <ErrorEstado error={error} onRetry={recargar} /> : null}
      {data?.length === 0 ? (
        <EstadoVacio
          titulo={soloMios ? 'Todavía no aportaste ejercicios' : 'No hay ejercicios'}
          texto={soloMios ? 'Tocá “Nuevo ejercicio” para publicar el primero. Toda la comunidad recibe una notificación.' : undefined}
        />
      ) : null}
      <View style={{ gap: 10 }}>
        {data?.map((e) => {
          const mio = e.creadoPor === usuario.id;
          const borrable = mio || esSuper(usuario);
          return (
            <Card key={e.id} style={{ padding: 14 }} onPress={() => navigation.navigate('Ejercicio', { id: e.id })}>
              <Row style={{ justifyContent: 'space-between' }}>
                <View style={{ flex: 1, gap: 4 }}>
                  <T weight="700" numberOfLines={1}>{e.titulo}</T>
                  <Row gap={6}>
                    <Chip label={e.dificultad} color={colorDificultad(e.dificultad, colors)} />
                    <T muted size={12}>{e.categoria} · {e.autor || 'sin autor'}</T>
                  </Row>
                  <T muted size={12}>★ {e.valoracionPromedio ?? '–'} · {e.totalComentarios} comentarios · +{e.xpRecompensa} XP</T>
                </View>
                <Row gap={14}>
                  {mio ? (
                    <Pressable onPress={() => navigation.navigate('FormEjercicio', { id: e.id })} hitSlop={8} accessibilityLabel="Editar">
                      <Ionicons name="create-outline" size={21} color={colors.primary} />
                    </Pressable>
                  ) : null}
                  {borrable ? (
                    <Pressable onPress={() => borrar(e)} hitSlop={8} accessibilityLabel={mio ? 'Eliminar' : 'Eliminar (moderación)'}>
                      <Ionicons name={mio ? 'trash-outline' : 'shield-outline'} size={21} color={colors.danger} />
                    </Pressable>
                  ) : null}
                </Row>
              </Row>
            </Card>
          );
        })}
      </View>
    </View>
  );
}

function Categorias() {
  const { colors } = useTheme();
  const { usuario } = useAuth();
  const { data, error, cargando, recargar } = useApi('/categorias');
  const [editando, setEditando] = useState(null); // null | {} | categoria
  const [msg, setMsg] = useState(null);

  const borrar = async (c) => {
    if (!(await confirmar('Eliminar categoría', `Se eliminarán también sus ${c.totalEjercicios} ejercicios. ¿Continuar?`, 'Eliminar', true))) return;
    try {
      await api(`/categorias/${c.id}`, { method: 'DELETE' });
      recargar();
    } catch (e) {
      setMsg(e.message);
    }
  };

  return (
    <View>
      <Button title="Nueva categoría" icon="add-circle-outline" onPress={() => setEditando({})} style={{ marginBottom: 12 }} />
      {msg ? <Banner onClose={() => setMsg(null)}>{msg}</Banner> : null}
      {cargando ? <Loading /> : null}
      {error && !data ? <ErrorEstado error={error} onRetry={recargar} /> : null}
      <View style={{ gap: 10 }}>
        {data?.map((c) => (
          <Card key={c.id} style={{ padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Ionicons name={c.icono || 'cube-outline'} size={22} color={colors.primary} />
            <View style={{ flex: 1 }}>
              <T weight="700">{c.nombre}</T>
              <T muted size={12.5} numberOfLines={2}>{c.descripcion || 'Sin descripción'} · {c.totalEjercicios} ejercicios</T>
            </View>
            <Pressable onPress={() => setEditando(c)} hitSlop={8} accessibilityLabel="Editar"><Ionicons name="create-outline" size={21} color={colors.primary} /></Pressable>
            {esSuper(usuario) ? (
              <Pressable onPress={() => borrar(c)} hitSlop={8} accessibilityLabel="Eliminar"><Ionicons name="trash-outline" size={21} color={colors.danger} /></Pressable>
            ) : null}
          </Card>
        ))}
      </View>
      <FormCategoria categoria={editando} onClose={() => setEditando(null)} onGuardada={() => { setEditando(null); recargar(); }} />
    </View>
  );
}

function FormCategoria({ categoria, onClose, onGuardada }) {
  const [nombre, setNombre] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [error, setError] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [abierta, setAbierta] = useState(null);
  if (categoria !== abierta) {
    setAbierta(categoria);
    setNombre(categoria?.nombre || '');
    setDescripcion(categoria?.descripcion || '');
    setError(null);
  }
  const guardar = async () => {
    if (nombre.trim().length < 3) return setError('El nombre debe tener al menos 3 caracteres');
    setCargando(true);
    try {
      const body = { nombre: nombre.trim(), descripcion: descripcion.trim(), icono: categoria?.icono || 'cube-outline' };
      if (categoria?.id) await api(`/categorias/${categoria.id}`, { method: 'PUT', body });
      else await api('/categorias', { method: 'POST', body });
      onGuardada();
    } catch (e) {
      setError(e.message);
    } finally {
      setCargando(false);
    }
  };
  return (
    <GlassModal visible={!!categoria} onClose={onClose}>
      <H2 style={{ marginBottom: 14 }}>{categoria?.id ? 'Editar categoría' : 'Nueva categoría'}</H2>
      {error ? <Banner>{error}</Banner> : null}
      <Input label="Nombre" value={nombre} onChangeText={setNombre} maxLength={40} />
      <Input label="Descripción" value={descripcion} onChangeText={setDescripcion} maxLength={200} multiline />
      <View style={{ gap: 10 }}>
        <Button title="Guardar" onPress={guardar} loading={cargando} />
        <Button title="Cancelar" variant="outline" onPress={onClose} />
      </View>
    </GlassModal>
  );
}

const ROLES = ['usuario', 'superadmin'];

function Usuarios() {
  const { colors } = useTheme();
  const { usuario: yo } = useAuth();
  const [q, setQ] = useState('');
  const resumen = useApi('/admin/resumen');
  const [qDeb, setQDeb] = useState('');
  useEffect(() => { const t = setTimeout(() => setQDeb(q.trim()), 350); return () => clearTimeout(t); }, [q]);
  const { data, error, cargando, recargar } = useApi(`/admin/usuarios?q=${encodeURIComponent(qDeb)}`);
  const [sel, setSel] = useState(null);
  const [msg, setMsg] = useState(null);

  const cambiarRol = async (u, rol) => {
    try {
      await api(`/admin/usuarios/${u.id}/rol`, { method: 'PATCH', body: { rol } });
      setSel(null);
      setMsg({ tipo: 'ok', texto: `${u.nombre} ahora es ${rol}` });
      recargar();
    } catch (e) {
      setMsg({ tipo: 'error', texto: e.message });
    }
  };
  const borrar = async (u) => {
    if (!(await confirmar('Eliminar usuario', `¿Eliminar la cuenta de ${u.nombre}? No se puede deshacer.`, 'Eliminar', true))) return;
    try {
      await api(`/admin/usuarios/${u.id}`, { method: 'DELETE' });
      setSel(null);
      recargar();
      resumen.recargar();
    } catch (e) {
      setMsg({ tipo: 'error', texto: e.message });
    }
  };

  const r = resumen.data;
  return (
    <View>
      {r ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
          {[['Usuarios', r.usuarios], ['Superadmins', r.superadmins], ['Autores', r.autores], ['Ejercicios', r.ejercicios], ['Completados', r.completados], ['Saludos', r.saludos]].map(([l, v]) => (
            <Card key={l} style={{ width: '31%', flexGrow: 1, padding: 10, alignItems: 'center' }}>
              <T weight="800" size={18}>{v}</T>
              <T muted size={11}>{l}</T>
            </Card>
          ))}
        </View>
      ) : null}
      <Input icon="search-outline" placeholder="Buscar por nombre o email" value={q} onChangeText={setQ} autoCapitalize="none" />
      {msg ? <Banner tipo={msg.tipo} onClose={() => setMsg(null)}>{msg.texto}</Banner> : null}
      {cargando ? <Loading /> : null}
      {error && !data ? <ErrorEstado error={error} onRetry={recargar} /> : null}
      <View style={{ gap: 8 }}>
        {data?.map((u) => (
          <Card key={u.id} onPress={u.id !== yo.id ? () => setSel(u) : undefined} style={{ padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Avatar uri={u.avatar} nombre={u.nombre} size={36} />
            <View style={{ flex: 1 }}>
              <T weight="700" numberOfLines={1}>{u.nombre}{u.id === yo.id ? ' (vos)' : ''}</T>
              <T muted size={12} numberOfLines={1}>{u.email} · Nv {u.nivel} · {u.xp} XP</T>
            </View>
            <Chip label={ROL_LABEL[u.rol] || u.rol} color={esSuper(u) ? colors.warning : colors.textMuted} />
          </Card>
        ))}
      </View>
      <GlassModal visible={!!sel} onClose={() => setSel(null)}>
        {sel ? (
          <>
            <Row style={{ marginBottom: 14 }}>
              <Avatar uri={sel.avatar} nombre={sel.nombre} size={44} />
              <View style={{ flex: 1 }}>
                <T weight="800" size={16}>{sel.nombre}</T>
                <T muted size={12.5}>{sel.email}</T>
              </View>
            </Row>
            <T weight="600" style={{ marginBottom: 8 }}>Asignar rol</T>
            <View style={{ gap: 8, marginBottom: 16 }}>
              {ROLES.map((rol) => (
                <Button key={rol} title={ROL_LABEL[rol]} variant={sel.rol === rol ? 'primary' : 'outline'} small onPress={() => sel.rol !== rol && cambiarRol(sel, rol)} />
              ))}
            </View>
            <Button title="Eliminar usuario" icon="trash-outline" variant="danger" small onPress={() => borrar(sel)} />
          </>
        ) : null}
      </GlassModal>
    </View>
  );
}

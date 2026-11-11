// Detalle de un ejercicio + interacción entre usuarios: valoraciones y comentarios con respuestas.
import { useLayoutEffect, useState } from 'react';
import { Pressable, RefreshControl, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useApi } from '../lib/useApi';
import { esAutor, esSuper } from '../lib/roles';
import Viewport3D from '../components/Viewport3D';
import {
  Avatar, Banner, Button, Card, Chip, colorDificultad, confirmar, ErrorEstado, fechaRelativa, H1, H2, Input, Loading, Row, Screen, Stars, T,
} from '../components/ui';

export default function ExerciseDetailScreen({ route, navigation }) {
  const { id } = route.params;
  const { colors } = useTheme();
  const { usuario } = useAuth();
  const ej = useApi(`/ejercicios/${id}`);
  const com = useApi(`/ejercicios/${id}/comentarios`);
  const [texto, setTexto] = useState('');
  const [respondiendo, setRespondiendo] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState(null);

  const e = ej.data;
  // Editar: solo el autor. Borrar: el autor o el superadmin (moderación).
  const puedeEditar = esAutor(usuario, e);
  const puedeBorrar = puedeEditar || (e && esSuper(usuario));

  useLayoutEffect(() => {
    const borrarEjercicio = async () => {
      const aviso = puedeEditar
        ? `¿Eliminar "${e.titulo}"? También se borra el progreso y los comentarios.`
        : `Vas a eliminar "${e.titulo}" de ${e.autor || 'otro usuario'} como moderación. Se le va a avisar.`;
      if (!(await confirmar(puedeEditar ? 'Eliminar ejercicio' : 'Moderar ejercicio', aviso, 'Eliminar', true))) return;
      try {
        await api(`/ejercicios/${id}`, { method: 'DELETE' });
        navigation.goBack();
      } catch (err) {
        setError(err.message);
      }
    };
    navigation.setOptions({
      title: e?.categoria || 'Ejercicio',
      headerRight: puedeBorrar
        ? () => (
            <View style={{ flexDirection: 'row', gap: 18 }}>
              {puedeEditar ? (
                <Pressable onPress={() => navigation.navigate('FormEjercicio', { id })} hitSlop={10} accessibilityLabel="Editar ejercicio">
                  <Ionicons name="create-outline" size={22} color={colors.primary} />
                </Pressable>
              ) : null}
              <Pressable onPress={borrarEjercicio} hitSlop={10} accessibilityLabel={puedeEditar ? 'Eliminar ejercicio' : 'Eliminar ejercicio (moderación)'}>
                <Ionicons name={puedeEditar ? 'trash-outline' : 'shield-outline'} size={21} color={colors.danger} />
              </Pressable>
            </View>
          )
        : undefined,
    });
  }, [navigation, e, puedeEditar, puedeBorrar, colors, id]);

  const valorar = async (puntaje) => {
    try {
      const r = await api(`/ejercicios/${id}/valoracion`, { method: 'PUT', body: { puntaje } });
      ej.setData((d) => ({ ...d, ...r }));
    } catch (err) {
      setError(err.message);
    }
  };

  const comentar = async () => {
    if (texto.trim().length < 2) return setError('El comentario es muy corto');
    setEnviando(true);
    setError(null);
    try {
      await api(`/ejercicios/${id}/comentarios`, { method: 'POST', body: { texto: texto.trim(), idPadre: respondiendo?.id || null } });
      setTexto('');
      setRespondiendo(null);
      com.recargar();
    } catch (err) {
      setError(err.message);
    } finally {
      setEnviando(false);
    }
  };

  const borrar = async (c) => {
    if (!(await confirmar('Borrar comentario', '¿Seguro que querés borrarlo?', 'Borrar', true))) return;
    try { await api(`/comentarios/${c.id}`, { method: 'DELETE' }); com.recargar(); } catch (err) { setError(err.message); }
  };

  const verPerfil = (idUsuario) => navigation.navigate('PerfilPublico', { id: idUsuario });

  if (ej.cargando) return <Loading />;
  if (ej.error && !e) return <Screen edges={[]}><ErrorEstado error={ej.error} onRetry={ej.recargar} /></Screen>;

  return (
    <Screen edges={[]} refreshControl={<RefreshControl refreshing={ej.refrescando} onRefresh={() => { ej.recargar(); com.recargar(); }} tintColor={colors.primary} />}>
      <Row gap={8} style={{ marginBottom: 8 }}>
        <Chip label={e.dificultad} color={colorDificultad(e.dificultad, colors)} />
        <Chip label={`+${e.xpRecompensa} XP`} icon="flash" color={colors.primary} />
        {e.completado ? <Chip label="Completado" icon="checkmark" color={colors.ai} /> : null}
      </Row>
      <H1 style={{ marginBottom: 6 }}>{e.titulo}</H1>
      <T muted style={{ marginBottom: 16, lineHeight: 21 }}>{e.descripcion}</T>

      <Viewport3D estado={e.estadoInicial} objetivo={e.estadoObjetivo} height={230} compacto interactivo={false} />
      <T muted size={12} center style={{ marginTop: 6, marginBottom: 14 }}>Cubo violeta: estado inicial · líneas verdes: objetivo</T>

      <Button title={e.completado ? 'Practicar de nuevo' : 'Comenzar en el simulador'} icon="play" onPress={() => navigation.navigate('SimuladorEjercicio', { id })} />

      <Card style={{ marginTop: 16 }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <View>
            <T weight="700">Tu valoración</T>
            <T muted size={12.5}>{e.totalValoraciones ? `Promedio ★ ${e.valoracionPromedio} (${e.totalValoraciones})` : 'Sé el primero en valorar'}</T>
          </View>
          <Stars value={e.miValoracion || 0} onChange={valorar} size={24} />
        </Row>
        {e.autor ? (
          <Pressable onPress={() => navigation.navigate('PerfilPublico', { id: e.creadoPor })} style={{ marginTop: 10 }} hitSlop={6}>
            <T muted size={12.5}>Aportado por <T size={12.5} weight="700" color={colors.primary}>{e.autor}</T>{puedeEditar ? ' (vos)' : ''}</T>
          </Pressable>
        ) : null}
      </Card>

      <H2 style={{ marginTop: 22, marginBottom: 10 }}>Comentarios {com.data ? `(${com.data.reduce((n, c) => n + 1 + c.respuestas.length, 0)})` : ''}</H2>
      {error ? <Banner onClose={() => setError(null)}>{error}</Banner> : null}
      {respondiendo ? (
        <Row style={{ marginBottom: 6 }}>
          <T muted size={13} style={{ flex: 1 }}>Respondiendo a {respondiendo.autor.nombre}</T>
          <Pressable onPress={() => setRespondiendo(null)}><T color={colors.primary} size={13} weight="700">Cancelar</T></Pressable>
        </Row>
      ) : null}
      <Input
        placeholder={respondiendo ? 'Escribí tu respuesta…' : 'Hacé una pregunta o compartí un tip…'}
        value={texto}
        onChangeText={setTexto}
        multiline
        maxLength={500}
        style={{ marginBottom: 8 }}
      />
      <Button title={respondiendo ? 'Responder' : 'Comentar'} icon="chatbubble-ellipses-outline" small onPress={comentar} loading={enviando} style={{ alignSelf: 'flex-end', marginBottom: 14 }} />

      {com.error && !com.data ? <ErrorEstado error={com.error} onRetry={com.recargar} /> : null}
      {com.data?.length === 0 ? <T muted center style={{ padding: 16 }}>Todavía no hay comentarios.</T> : null}
      <View style={{ gap: 10 }}>
        {com.data?.map((c) => (
          <Card key={c.id} style={{ padding: 14 }}>
            <Comentario c={c} idAutorEjercicio={e.creadoPor} onPerfil={verPerfil} onResponder={() => setRespondiendo(c)} onBorrar={() => borrar(c)} />
            {c.respuestas.map((r) => (
              <View key={r.id} style={{ marginTop: 12, marginLeft: 18, paddingLeft: 12, borderLeftWidth: 2, borderLeftColor: colors.border }}>
                <Comentario c={r} idAutorEjercicio={e.creadoPor} onPerfil={verPerfil} onBorrar={() => borrar(r)} />
              </View>
            ))}
          </Card>
        ))}
      </View>
    </Screen>
  );
}

function Comentario({ c, idAutorEjercicio, onPerfil, onResponder, onBorrar }) {
  const { colors } = useTheme();
  return (
    <View>
      <Row gap={8}>
        <Pressable onPress={() => onPerfil(c.autor.id)} hitSlop={6} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 }} accessibilityLabel={`Ver perfil de ${c.autor.nombre}`}>
          <Avatar uri={c.autor.avatar} nombre={c.autor.nombre} size={28} />
          <T weight="700" size={13.5} numberOfLines={1} style={{ flexShrink: 1 }}>{c.autor.nombre}</T>
        </Pressable>
        {c.autor.id === idAutorEjercicio ? <Chip label="Autor" color={colors.ai} /> : null}
        {c.autor.rol === 'superadmin' ? <Chip label="Superadmin" color={colors.warning} /> : null}
        <T muted size={11.5} style={{ marginLeft: 'auto' }}>{fechaRelativa(c.creadoEn)}</T>
      </Row>
      <T size={14} style={{ marginTop: 6, lineHeight: 20 }}>{c.texto}</T>
      <Row gap={16} style={{ marginTop: 6 }}>
        {onResponder ? <Pressable onPress={onResponder} hitSlop={6}><T size={12.5} weight="700" color={colors.primary}>Responder</T></Pressable> : null}
        {c.puedeBorrar ? <Pressable onPress={onBorrar} hitSlop={6}><T size={12.5} weight="700" color={colors.danger}>Borrar</T></Pressable> : null}
      </Row>
    </View>
  );
}

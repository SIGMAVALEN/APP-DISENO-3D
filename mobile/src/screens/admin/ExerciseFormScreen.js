// Alta y modificación de ejercicios (cualquier usuario; solo el autor edita) con vista previa 3D en vivo.
import { useEffect, useLayoutEffect, useState } from 'react';
import { TextInput, View } from 'react-native';
import { api } from '../../api/client';
import { useTheme } from '../../context/ThemeContext';
import Viewport3D from '../../components/Viewport3D';
import { Banner, Button, Card, Chip, ErrorEstado, H2, Input, Loading, Row, Screen, Segmented, T } from '../../components/ui';
import { clonarEstado, ESTADO_DEFAULT } from '../../lib/math3d';

const vacio = { titulo: '', descripcion: '', idCategoria: null, dificultad: 'Fácil', xpRecompensa: '50' };
const OBJETIVO_EJEMPLO = { position: [2, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] };

export default function ExerciseFormScreen({ route, navigation }) {
  const id = route.params?.id;
  const { colors } = useTheme();
  const [form, setForm] = useState(vacio);
  const [inicial, setInicial] = useState(clonarEstado(ESTADO_DEFAULT));
  const [objetivo, setObjetivo] = useState(clonarEstado(OBJETIVO_EJEMPLO));
  const [categorias, setCategorias] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState(null);
  const [errores, setErrores] = useState({});
  const [error, setError] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [editar, setEditar] = useState('objetivo');

  useLayoutEffect(() => { navigation.setOptions({ title: id ? 'Editar ejercicio' : 'Nuevo ejercicio' }); }, [navigation, id]);

  const cargar = async () => {
    setCargando(true);
    try {
      const cats = await api('/categorias');
      setCategorias(cats);
      if (id) {
        const e = await api(`/ejercicios/${id}`);
        setForm({ titulo: e.titulo, descripcion: e.descripcion, idCategoria: e.idCategoria, dificultad: e.dificultad, xpRecompensa: String(e.xpRecompensa) });
        setInicial(e.estadoInicial);
        setObjetivo(e.estadoObjetivo);
      } else if (cats[0]) {
        setForm((f) => ({ ...f, idCategoria: cats[0].id }));
      }
      setErrorCarga(null);
    } catch (e) {
      setErrorCarga(e);
    } finally {
      setCargando(false);
    }
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps, react-hooks/set-state-in-effect -- carga inicial
  useEffect(() => { cargar(); }, [id]);

  const set = (k) => (v) => { setForm((f) => ({ ...f, [k]: v })); setErrores((e) => ({ ...e, [k]: null })); };

  const guardar = async () => {
    const e = {};
    if (form.titulo.trim().length < 3) e.titulo = 'Mínimo 3 caracteres';
    if (form.descripcion.trim().length < 10) e.descripcion = 'Mínimo 10 caracteres';
    if (!form.idCategoria) e.idCategoria = 'Elegí una categoría';
    const xp = Number(form.xpRecompensa);
    if (!Number.isInteger(xp) || xp < 10 || xp > 500) e.xpRecompensa = 'Entre 10 y 500';
    if ([...inicial.scale, ...objetivo.scale].some((n) => !(n > 0))) e.estado = 'La escala debe ser mayor que 0';
    setErrores(e);
    setError(e.estado || null);
    if (Object.keys(e).length) return;
    setGuardando(true);
    try {
      const body = { titulo: form.titulo.trim(), descripcion: form.descripcion.trim(), idCategoria: form.idCategoria, dificultad: form.dificultad, xpRecompensa: xp, estadoInicial: inicial, estadoObjetivo: objetivo };
      if (id) await api(`/ejercicios/${id}`, { method: 'PUT', body });
      else await api('/ejercicios', { method: 'POST', body });
      navigation.goBack();
    } catch (err) {
      setError(err.message);
      if (err.campos) setErrores(err.campos);
    } finally {
      setGuardando(false);
    }
  };

  if (cargando) return <Loading />;
  if (errorCarga) return <Screen edges={[]}><ErrorEstado error={errorCarga} onRetry={cargar} /></Screen>;

  const estadoEditado = editar === 'objetivo' ? objetivo : inicial;
  const setEstadoEditado = editar === 'objetivo' ? setObjetivo : setInicial;

  return (
    <Screen edges={['bottom']}>
      {error ? <Banner onClose={() => setError(null)}>{error}</Banner> : null}
      <Input label="Título" value={form.titulo} onChangeText={set('titulo')} error={errores.titulo} maxLength={60} placeholder="Ej: Torre inclinada" />
      <Input label="Consigna" value={form.descripcion} onChangeText={set('descripcion')} error={errores.descripcion} maxLength={400} multiline placeholder="Explicá qué tiene que lograr quien lo haga" />

      <T size={13} weight="600" muted style={{ marginBottom: 6 }}>Categoría</T>
      <Row style={{ flexWrap: 'wrap', marginBottom: errores.idCategoria ? 4 : 14 }} gap={8}>
        {categorias.map((c) => <Chip key={c.id} label={c.nombre} active={form.idCategoria === c.id} onPress={() => set('idCategoria')(c.id)} />)}
      </Row>
      {errores.idCategoria ? <T size={12.5} color={colors.danger} style={{ marginBottom: 12 }}>{errores.idCategoria}</T> : null}

      <T size={13} weight="600" muted style={{ marginBottom: 6 }}>Dificultad</T>
      <Segmented value={form.dificultad} onChange={set('dificultad')} options={['Fácil', 'Medio', 'Avanzado'].map((d) => ({ value: d, label: d }))} />
      <View style={{ height: 14 }} />
      <Input label="XP de recompensa" value={form.xpRecompensa} onChangeText={(v) => set('xpRecompensa')(v.replace(/\D/g, ''))} error={errores.xpRecompensa} keyboardType="number-pad" maxLength={3} />

      <H2 style={{ marginBottom: 8 }}>Estados 3D</H2>
      <Viewport3D estado={inicial} objetivo={objetivo} height={240} compacto />
      <T muted size={12} center style={{ marginVertical: 6 }}>Violeta: inicial · Verde punteado: objetivo</T>
      <Segmented value={editar} onChange={setEditar} options={[{ value: 'inicial', label: 'Estado inicial' }, { value: 'objetivo', label: 'Objetivo' }]} />
      <Card style={{ marginTop: 10, marginBottom: 18, gap: 10 }}>
        {[['position', 'Posición'], ['rotation', 'Rotación (°)'], ['scale', 'Escala']].map(([k, label]) => (
          <View key={k}>
            <T size={13} weight="600" muted style={{ marginBottom: 6 }}>{label}</T>
            <Row gap={8}>
              {[0, 1, 2].map((i) => (
                <CampoNumero
                  key={`${editar}-${k}-${i}`}
                  eje={'XYZ'[i]}
                  color={[colors.axisX, colors.axisY, colors.axisZ][i]}
                  valor={estadoEditado[k][i]}
                  onChange={(n) => setEstadoEditado((e) => { const c = clonarEstado(e); c[k][i] = n; return c; })}
                />
              ))}
            </Row>
          </View>
        ))}
      </Card>

      <Button title={id ? 'Guardar cambios' : 'Publicar ejercicio'} icon="cloud-upload-outline" onPress={guardar} loading={guardando} />
      {!id ? <T muted size={12} center style={{ marginTop: 8 }}>Al publicar, toda la comunidad recibe una notificación. Solo vos vas a poder editarlo o borrarlo.</T> : null}
    </Screen>
  );
}

function CampoNumero({ eje, color, valor, onChange }) {
  const { colors } = useTheme();
  const [texto, setTexto] = useState(String(valor));
  return (
    <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: colors.border, borderRadius: 10, backgroundColor: colors.inputBg, paddingHorizontal: 8 }}>
      <T weight="800" size={12} color={color}>{eje}</T>
      <TextInput
        value={texto}
        onChangeText={(t) => {
          const limpio = t.replace(',', '.').replace(/[^0-9.-]/g, '');
          setTexto(limpio);
          const n = Number(limpio);
          if (limpio !== '' && limpio !== '-' && Number.isFinite(n)) onChange(n);
        }}
        keyboardType="numbers-and-punctuation"
        style={{ flex: 1, color: colors.text, paddingVertical: 8, paddingHorizontal: 6, fontSize: 14 }}
        accessibilityLabel={`Valor ${eje}`}
      />
    </View>
  );
}

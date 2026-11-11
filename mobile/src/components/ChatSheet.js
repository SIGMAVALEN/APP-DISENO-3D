// Consola de chat con el tutor IA (Gemini) en una hoja desplegable inferior.
// El viewport queda visible arriba para ver en vivo cómo la IA transforma el objeto.
import { useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../context/ThemeContext';
import { api } from '../api/client';
import { Chip, T, vibrar } from './ui';

const SUGERENCIAS = ['Giralo 45 grados en X', 'Subilo 2 unidades', 'Escalalo al doble', '¿Cuánta XP tengo?', 'Dame una pista', '¿Cómo optimizo esta geometría?', 'Reiniciá la vista'];

export default function ChatSheet({ visible, onClose, estado, idEjercicio, onAcciones }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [mensajes, setMensajes] = useState([
    { rol: 'ia', texto: '¡Hola! Soy Blendy, tu tutor 3D 🤖. Pedime que mueva, rote o escale el objeto, o preguntame lo que quieras sobre modelado.' },
  ]);
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const scroll = useRef(null);

  const enviar = async (contenido) => {
    const mensaje = (contenido ?? texto).trim();
    if (!mensaje || enviando) return;
    vibrar();
    setTexto('');
    const historial = mensajes.slice(1).map((m) => ({ rol: m.rol, texto: m.texto }));
    setMensajes((m) => [...m, { rol: 'usuario', texto: mensaje }]);
    setEnviando(true);
    try {
      const r = await api('/ia/chat', { method: 'POST', body: { mensaje, historial, estado, idEjercicio: idEjercicio || null } });
      if (r.acciones?.length) onAcciones(r.acciones, r.estado);
      setMensajes((m) => [...m, { rol: 'ia', texto: r.respuesta, acciones: r.acciones?.length || 0, aviso: r.aviso, motor: r.motor }]);
    } catch (e) {
      setMensajes((m) => [...m, { rol: 'error', texto: e.message }]);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={{ flex: 0.36 }} onPress={onClose} accessibilityLabel="Cerrar chat" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 0.64 }}>
        <View style={[styles.sheet, { backgroundColor: colors.card, borderColor: colors.border, paddingBottom: insets.bottom + 8 }]}>
          <Pressable onPress={onClose} style={{ alignItems: 'center', paddingVertical: 8 }} accessibilityLabel="Cerrar chat">
            <View style={{ width: 42, height: 5, borderRadius: 3, backgroundColor: colors.border }} />
          </Pressable>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingBottom: 8 }}>
            <View style={{ width: 34, height: 34, borderRadius: 11, backgroundColor: colors.aiSoft, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="sparkles" size={18} color={colors.ai} />
            </View>
            <View style={{ flex: 1 }}>
              <T weight="800">Blendy · Tutor IA</T>
              <T muted size={12}>Gemini con Function Calling</T>
            </View>
            <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Cerrar">
              <Ionicons name="chevron-down" size={24} color={colors.textMuted} />
            </Pressable>
          </View>

          <ScrollView
            ref={scroll}
            style={{ flex: 1 }}
            contentContainerStyle={{ padding: 14, gap: 10 }}
            onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: true })}
            keyboardShouldPersistTaps="handled"
          >
            {mensajes.map((m, i) => <Burbuja key={i} m={m} />)}
            {enviando ? (
              <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', paddingLeft: 4 }}>
                <ActivityIndicator size="small" color={colors.ai} />
                <T muted size={13}>Blendy está pensando…</T>
              </View>
            ) : null}
          </ScrollView>

          <ScrollView horizontal style={{ flexGrow: 0 }} showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 14, paddingVertical: 6, alignItems: 'center' }} keyboardShouldPersistTaps="handled">
            {SUGERENCIAS.map((s) => <Chip key={s} label={s} color={colors.ai} onPress={() => enviar(s)} />)}
          </ScrollView>

          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingHorizontal: 12, paddingTop: 6 }}>
            <TextInput
              value={texto}
              onChangeText={setTexto}
              placeholder='Ej: "rotalo 90 en Y"'
              placeholderTextColor={colors.textMuted}
              style={[styles.input, { color: colors.text, backgroundColor: colors.inputBg, borderColor: colors.border }]}
              multiline
              maxLength={600}
              onSubmitEditing={() => enviar()}
              blurOnSubmit
              returnKeyType="send"
              accessibilityLabel="Mensaje para el tutor"
            />
            <Pressable
              onPress={() => enviar()}
              disabled={!texto.trim() || enviando}
              accessibilityLabel="Enviar mensaje"
              style={{ width: 46, height: 46, borderRadius: 14, backgroundColor: colors.ai, alignItems: 'center', justifyContent: 'center', opacity: !texto.trim() || enviando ? 0.5 : 1 }}
            >
              <Ionicons name="send" size={19} color="#fff" />
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function Burbuja({ m }) {
  const { colors } = useTheme();
  const esUsuario = m.rol === 'usuario';
  const esError = m.rol === 'error';
  return (
    <View style={{ alignSelf: esUsuario ? 'flex-end' : 'flex-start', maxWidth: '86%' }}>
      <View
        style={{
          backgroundColor: esUsuario ? colors.primary : esError ? colors.dangerSoft : colors.cardAlt,
          borderRadius: 16, borderBottomRightRadius: esUsuario ? 4 : 16, borderBottomLeftRadius: esUsuario ? 16 : 4,
          paddingHorizontal: 13, paddingVertical: 9,
        }}
      >
        <T color={esUsuario ? '#fff' : esError ? colors.danger : colors.text} size={14.5} style={{ lineHeight: 20 }}>{m.texto}</T>
      </View>
      {m.acciones ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4, marginLeft: 4 }}>
          <Ionicons name="flash" size={12} color={colors.ai} />
          <T size={11.5} color={colors.ai}>{m.acciones} acción(es) aplicada(s) al viewport</T>
        </View>
      ) : null}
      {m.aviso ? <T size={11.5} muted style={{ marginTop: 3, marginLeft: 4 }}>{m.aviso}</T> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: { flex: 1, borderTopLeftRadius: 22, borderTopRightRadius: 22, borderWidth: 1, borderBottomWidth: 0 },
  input: { flex: 1, minHeight: 46, maxHeight: 110, borderRadius: 14, borderWidth: 1, paddingHorizontal: 14, paddingTop: 12, paddingBottom: 12, fontSize: 15 },
});

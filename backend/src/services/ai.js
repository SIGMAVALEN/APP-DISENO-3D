// Tutor virtual con Google Gemini + Function Calling.
//
// Flujo: el usuario escribe → Gemini decide si llamar herramientas →
//   - transformObject / resetViewport: se simulan en el servidor sobre una copia del
//     estado 3D y se devuelven a la app como "acciones" que ésta aplica al viewport.
//   - getUserStats: se ejecuta de verdad contra la base de datos.
// El bucle continúa hasta que Gemini responde con texto (máx. 6 vueltas).
import { GoogleGenAI, Type } from '@google/genai';
import { config } from '../config.js';
import { estadisticasUsuario } from '../lib/game.js';

const ESTADO_DEFAULT = { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] };
const AXIS = { x: 0, y: 1, z: 2 };
const KEY = { move: 'position', rotate: 'rotation', scale: 'scale' };

export const clonar = (e) => ({ position: [...e.position], rotation: [...e.rotation], scale: [...e.scale] });
const r2 = (n) => Math.round(n * 1000) / 1000;

/** Aplica una transformación TRS. move/rotate: suman; scale: multiplica. Con absolute=true fija el valor. */
export function aplicarTransformacion(estado, { action, axis, value, absolute }) {
  const e = clonar(estado);
  const k = KEY[action];
  const i = AXIS[axis];
  if (k === undefined || i === undefined || !Number.isFinite(value)) throw new Error('Parámetros de transformación inválidos');
  if (absolute) e[k][i] = value;
  else if (action === 'scale') e[k][i] = e[k][i] * value;
  else e[k][i] = e[k][i] + value;
  if (action === 'rotate') e[k][i] = ((((e[k][i] + 180) % 360) + 360) % 360) - 180; // normaliza a [-180, 180)
  if (action === 'scale') e[k][i] = Math.min(20, Math.max(0.05, e[k][i]));
  if (action === 'move') e[k][i] = Math.min(50, Math.max(-50, e[k][i]));
  e[k][i] = r2(e[k][i]);
  return e;
}

const herramientas = [
  {
    functionDeclarations: [
      {
        name: 'transformObject',
        description:
          'Modifica las propiedades 3D del objeto actual en el simulador. move y rotate son relativos (suman); scale es relativo multiplicando el factor actual. Con absolute=true fija el valor exacto. Las rotaciones son en grados.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            action: { type: Type.STRING, enum: ['move', 'rotate', 'scale'], description: 'Tipo de transformación' },
            axis: { type: Type.STRING, enum: ['x', 'y', 'z'], description: 'Eje sobre el que se aplica' },
            value: { type: Type.NUMBER, description: 'Unidades, grados o factor de escala' },
            absolute: { type: Type.BOOLEAN, description: 'Si es true, fija el valor en vez de sumarlo/multiplicarlo' },
          },
          required: ['action', 'axis', 'value'],
        },
      },
      {
        name: 'getUserStats',
        description: 'Consulta en la base de datos la XP actual, el nivel, el rango, la racha y los ejercicios completados del usuario.',
        parameters: {
          type: Type.OBJECT,
          properties: { userId: { type: Type.NUMBER, description: 'ID del usuario. Omitir para el usuario actual.' } },
        },
      },
      {
        name: 'resetViewport',
        description: 'Restablece la posición, rotación y escala del objeto 3D a sus valores por defecto (origen, sin rotación, escala 1).',
        parameters: { type: Type.OBJECT, properties: {} },
      },
    ],
  },
];

function promptSistema(usuario, estado, ejercicio) {
  const obj = ejercicio ? JSON.parse(ejercicio.estado_objetivo_json) : null;
  return `Sos "Blendy", el tutor virtual de BlendGO!, una app que enseña modelado 3D (Traslación, Rotación y Escalado - TRS).
Hablás en español rioplatense, con tono amable, claro y breve (máximo 4-5 oraciones). Usá ejemplos concretos.
Usuario: ${usuario.nombre} (id ${usuario.id}, rol ${usuario.rol}).
Sistema de coordenadas: Y es "arriba", X "derecha", Z "hacia la cámara". Rotaciones en grados.
Estado actual del objeto: position=${JSON.stringify(estado.position)}, rotation=${JSON.stringify(estado.rotation)}, scale=${JSON.stringify(estado.scale)}.
${ejercicio ? `Ejercicio en curso: "${ejercicio.titulo}" — ${ejercicio.descripcion}. Objetivo: position=${JSON.stringify(obj.position)}, rotation=${JSON.stringify(obj.rotation)}, scale=${JSON.stringify(obj.scale)}.
Si el usuario pide ayuda, guialo paso a paso y explicá el concepto en vez de resolverlo todo de una; pero si te da una orden explícita ("giralo 45 en X"), ejecutala.` : 'Modo libre (sin ejercicio).'}
Cuando el usuario pida mover, rotar, escalar o reiniciar, USÁ las herramientas en lugar de describir lo que haría. Para "al doble" usá scale con value 2; para "ponelo en X=3" usá absolute=true.
Si pregunta por su progreso, XP o nivel, usá getUserStats. Para preguntas teóricas (topología, optimización de geometría, pivotes, etc.) respondé con criterio de artista 3D profesional.
Después de ejecutar acciones, confirmá en una oración qué cambió.`;
}

export async function chatTutor({ usuario, mensaje, historial = [], estado, ejercicio }) {
  let estadoSim = clonar(estado || ESTADO_DEFAULT);
  const acciones = [];

  if (!config.geminiApiKey) return tutorSinIA({ usuario, mensaje, estadoSim, acciones, ejercicio });

  const ai = new GoogleGenAI({ apiKey: config.geminiApiKey });
  const contents = [
    ...historial.slice(-12).map((m) => ({ role: m.rol === 'usuario' ? 'user' : 'model', parts: [{ text: m.texto }] })),
    { role: 'user', parts: [{ text: mensaje }] },
  ];

  for (let vuelta = 0; vuelta < 6; vuelta++) {
    const res = await ai.models.generateContent({
      model: config.geminiModel,
      contents,
      config: { systemInstruction: promptSistema(usuario, estadoSim, ejercicio), tools: herramientas, temperature: 0.4 },
    });
    const llamadas = res.functionCalls || [];
    if (!llamadas.length) {
      return { respuesta: res.text?.trim() || 'Listo.', acciones, estado: estadoSim, motor: 'gemini' };
    }
    contents.push(res.candidates[0].content);
    const respuestas = [];
    for (const fc of llamadas) {
      let resultado;
      try {
        if (fc.name === 'transformObject') {
          const args = { ...fc.args, value: Number(fc.args?.value), absolute: !!fc.args?.absolute };
          estadoSim = aplicarTransformacion(estadoSim, args);
          acciones.push({ tipo: 'transformObject', ...args });
          resultado = { ok: true, nuevoEstado: estadoSim };
        } else if (fc.name === 'resetViewport') {
          estadoSim = clonar(ESTADO_DEFAULT);
          acciones.push({ tipo: 'resetViewport' });
          resultado = { ok: true, nuevoEstado: estadoSim };
        } else if (fc.name === 'getUserStats') {
          // Seguridad: un estudiante solo puede consultar SUS estadísticas.
          const pedido = Number(fc.args?.userId);
          const id = pedido && usuario.rol !== 'estudiante' ? pedido : usuario.id;
          const s = await estadisticasUsuario(id);
          resultado = s
            ? { nombre: s.usuario.nombre, nivel: s.nivel, xp: s.xp, rango: s.rango, racha: s.rachaActual, completados: s.ejerciciosCompletados, totales: s.ejerciciosTotales, ultimos: s.completados.slice(0, 5).map((c) => c.titulo) }
            : { error: 'Usuario no encontrado' };
        } else {
          resultado = { error: 'Herramienta desconocida' };
        }
      } catch (e) {
        resultado = { error: e.message };
      }
      respuestas.push({ functionResponse: { name: fc.name, id: fc.id, response: resultado } });
    }
    contents.push({ role: 'user', parts: respuestas });
  }
  return { respuesta: 'Apliqué los cambios pedidos.', acciones, estado: estadoSim, motor: 'gemini' };
}

// ---------- Modo sin IA (sin GEMINI_API_KEY o si Gemini falla) ----------
// Intérprete simple de órdenes en español para que la demo funcione siempre.
export async function tutorSinIA({ usuario, mensaje, estadoSim, acciones, ejercicio }) {
  const t = mensaje.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (/(reset|reinici|restablec|resete|volve.*origen)/.test(t)) {
    acciones.push({ tipo: 'resetViewport' });
    return { respuesta: 'Listo, volví el objeto a su estado por defecto.', acciones, estado: clonar(ESTADO_DEFAULT), motor: 'local' };
  }
  if (/(xp|nivel|progreso|estadistic|racha|cuantos ejercicios)/.test(t)) {
    const s = await estadisticasUsuario(usuario.id);
    return { respuesta: `Tenés ${s.xp} XP, sos nivel ${s.nivel} (${s.rango}) y completaste ${s.ejerciciosCompletados} de ${s.ejerciciosTotales} ejercicios. Racha actual: ${s.rachaActual} día(s).`, acciones, estado: estadoSim, motor: 'local' };
  }
  const action = /(gir|rot)/.test(t) ? 'rotate' : /(escal|agrand|achic|tamano|doble)/.test(t) ? 'scale' : /(mov|muev|desplaz|trasl|subi|baj|lleva|corre)/.test(t) ? 'move' : null;
  if (action) {
    const ejesPedidos = [...t.matchAll(/\b(?:eje\s*)?([xyz])\b/g)].map((m) => m[1]);
    const num = t.match(/-?\d+(?:[.,]\d+)?/);
    let value = num ? Number(num[0].replace(',', '.')) : action === 'rotate' ? 90 : action === 'scale' ? 2 : 1;
    if (/doble/.test(t)) value = 2;
    if (/mitad/.test(t)) value = 0.5;
    if (action === 'move' && /(baj|izquierd|atras)/.test(t) && value > 0) value = -value;
    const ejes = ejesPedidos.length ? ejesPedidos : action === 'scale' ? ['x', 'y', 'z'] : [/(subi|baj|arriba|abajo)/.test(t) ? 'y' : 'x'];
    const absolute = /\b(en|a)\s*-?\d/.test(t) && action !== 'scale' && /(pone|deja|coloca|lleva)/.test(t);
    for (const axis of ejes) {
      const args = { action, axis, value, absolute };
      estadoSim = aplicarTransformacion(estadoSim, args);
      acciones.push({ tipo: 'transformObject', ...args });
    }
    const verbo = { move: 'Moví', rotate: 'Roté', scale: 'Escalé' }[action];
    return { respuesta: `${verbo} el objeto en ${ejes.join(', ').toUpperCase()} (${value}${action === 'rotate' ? '°' : action === 'scale' ? '×' : ' u'}).`, acciones, estado: estadoSim, motor: 'local' };
  }
  const pista = ejercicio ? ` Para "${ejercicio.titulo}": ${ejercicio.descripcion}` : '';
  return {
    respuesta: `Puedo mover, rotar o escalar el objeto si me lo pedís (por ejemplo: "rotalo 45 en X", "subilo 2", "escalalo al doble") o contarte tu progreso.${pista}`,
    acciones,
    estado: estadoSim,
    motor: 'local',
  };
}

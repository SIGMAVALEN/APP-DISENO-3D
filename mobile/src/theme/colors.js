// "Estética 3D Studio": tema oscuro industrial con acentos neón,
// y su contraparte clara para cumplir el requisito de tema claro/oscuro.
export const dark = {
  mode: 'dark',
  bg: '#0F1117', // Dark Studio Canvas
  card: '#1E222D', // Slate Glass
  cardAlt: '#262B38',
  border: '#2E3443',
  primary: '#6366F1', // Electric Indigo
  primarySoft: 'rgba(99,102,241,0.16)',
  ai: '#10B981', // Cyber Emerald
  aiSoft: 'rgba(16,185,129,0.15)',
  text: '#F9FAFB',
  textMuted: '#9CA3AF',
  danger: '#F87171',
  dangerSoft: 'rgba(248,113,113,0.14)',
  warning: '#FBBF24',
  axisX: '#F87171',
  axisY: '#34D399',
  axisZ: '#60A5FA',
  grid: 'rgba(156,163,175,0.16)',
  gridStrong: 'rgba(156,163,175,0.32)',
  viewport: '#141823',
  overlay: 'rgba(5,7,12,0.55)',
  inputBg: '#161A24',
};

export const light = {
  mode: 'light',
  bg: '#F3F4F8',
  card: '#FFFFFF',
  cardAlt: '#EEF0F6',
  border: '#E2E5EE',
  primary: '#5457E5',
  primarySoft: 'rgba(99,102,241,0.12)',
  ai: '#059669',
  aiSoft: 'rgba(16,185,129,0.13)',
  text: '#111827',
  textMuted: '#6B7280',
  danger: '#DC2626',
  dangerSoft: 'rgba(220,38,38,0.1)',
  warning: '#D97706',
  axisX: '#E11D48',
  axisY: '#059669',
  axisZ: '#2563EB',
  grid: 'rgba(17,24,39,0.09)',
  gridStrong: 'rgba(17,24,39,0.2)',
  viewport: '#E7E9F1',
  overlay: 'rgba(15,17,23,0.35)',
  inputBg: '#F7F8FB',
};

export const radius = { sm: 10, md: 16, lg: 22, pill: 999 };
export const space = (n) => n * 4;

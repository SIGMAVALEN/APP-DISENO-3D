import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { dark, light } from '../theme/colors';

const ThemeContext = createContext(null);
const KEY = 'blendgo.tema';

/** Preferencia: 'system' | 'light' | 'dark'. Se guarda en el dispositivo y en la cuenta. */
export function ThemeProvider({ children }) {
  const sistema = useColorScheme();
  const [preferencia, setPreferenciaState] = useState('system');

  useEffect(() => {
    AsyncStorage.getItem(KEY).then((v) => v && setPreferenciaState(v)).catch(() => {});
  }, []);

  const setPreferencia = useCallback((v) => {
    setPreferenciaState(v);
    AsyncStorage.setItem(KEY, v).catch(() => {});
  }, []);

  const value = useMemo(() => {
    const modo = preferencia === 'system' ? (sistema === 'light' ? 'light' : 'dark') : preferencia;
    return { colors: modo === 'dark' ? dark : light, modo, preferencia, setPreferencia };
  }, [preferencia, sistema, setPreferencia]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);

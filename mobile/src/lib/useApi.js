import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { api } from '../api/client';

/**
 * Carga datos de la API con estados de carga/error y recarga al volver a la pantalla.
 * Devuelve { data, error, cargando, refrescando, recargar, setData }.
 */
export function useApi(path, { enFoco = true } = {}) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [refrescando, setRefrescando] = useState(false);
  const montado = useRef(true);
  useEffect(() => () => { montado.current = false; }, []);

  const cargar = useCallback(async (modo = 'inicial') => {
    if (!path) return;
    if (modo === 'refresh') setRefrescando(true);
    try {
      const r = await api(path);
      if (montado.current) { setData(r); setError(null); }
    } catch (e) {
      if (montado.current) setError(e);
    } finally {
      if (montado.current) { setCargando(false); setRefrescando(false); }
    }
  }, [path]);

  useFocusEffect(useCallback(() => { if (enFoco) cargar('foco'); }, [cargar, enFoco]));
  // eslint-disable-next-line react-hooks/set-state-in-effect -- carga de datos
  useEffect(() => { if (!enFoco) cargar(); }, [cargar, enFoco]);

  return { data, error, cargando: cargando && !data, refrescando, recargar: () => cargar('refresh'), setData };
}

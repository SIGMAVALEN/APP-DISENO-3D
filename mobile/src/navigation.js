// Navegación: React Navigation (Native Stack + Bottom Tabs).
// Sin sesión → pila de autenticación. Con sesión → pestañas + pantallas apiladas.
import { createNavigationContainerRef, DarkTheme, DefaultTheme, NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from './context/AuthContext';
import { useTheme } from './context/ThemeContext';
import { Loading } from './components/ui';

import LoginScreen from './screens/auth/LoginScreen';
import RegisterScreen from './screens/auth/RegisterScreen';
import ForgotPasswordScreen from './screens/auth/ForgotPasswordScreen';
import HomeScreen from './screens/HomeScreen';
import SimulatorScreen from './screens/SimulatorScreen';
import RankingScreen from './screens/RankingScreen';
import ProfileScreen from './screens/ProfileScreen';
import ExerciseDetailScreen from './screens/ExerciseDetailScreen';
import SettingsScreen from './screens/SettingsScreen';
import NotificationsScreen from './screens/NotificationsScreen';
import ManageScreen from './screens/admin/ManageScreen';
import ExerciseFormScreen from './screens/admin/ExerciseFormScreen';
import PublicProfileScreen from './screens/PublicProfileScreen';

export const navigationRef = createNavigationContainerRef();

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

const ICONOS = { Inicio: 'home', Simulador: 'cube', Ranking: 'podium', Gestion: 'add-circle', Perfil: 'person' };

function Tabs() {
  const { colors } = useTheme();
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: { backgroundColor: colors.card, borderTopColor: colors.border },
        tabBarLabelStyle: { fontSize: 11.5, fontWeight: '600' },
        tabBarIcon: ({ color, focused, size }) => <Ionicons name={focused ? ICONOS[route.name] : `${ICONOS[route.name]}-outline`} size={size - 2} color={color} />,
      })}
    >
      <Tab.Screen name="Inicio" component={HomeScreen} />
      <Tab.Screen name="Simulador" component={SimulatorScreen} />
      <Tab.Screen name="Ranking" component={RankingScreen} />
      <Tab.Screen name="Gestion" component={ManageScreen} options={{ title: 'Aportar' }} />
      <Tab.Screen name="Perfil" component={ProfileScreen} />
    </Tab.Navigator>
  );
}

export default function Navigation({ onReady }) {
  const { colors, modo } = useTheme();
  const { usuario, cargando } = useAuth();

  const base = modo === 'dark' ? DarkTheme : DefaultTheme;
  const navTheme = {
    ...base,
    colors: { ...base.colors, primary: colors.primary, background: colors.bg, card: colors.card, text: colors.text, border: colors.border, notification: colors.danger },
  };
  const stackOpts = {
    headerStyle: { backgroundColor: colors.bg },
    headerTintColor: colors.text,
    headerTitleStyle: { fontWeight: '700' },
    headerShadowVisible: false,
    headerBackButtonDisplayMode: 'minimal',
    contentStyle: { backgroundColor: colors.bg },
  };

  if (cargando) return <Loading texto="Abriendo BlendGO!…" />;

  return (
    <NavigationContainer ref={navigationRef} theme={navTheme} onReady={onReady}>
      <Stack.Navigator screenOptions={stackOpts}>
        {!usuario ? (
          <>
            <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
            <Stack.Screen name="Register" component={RegisterScreen} options={{ title: '' }} />
            <Stack.Screen name="Forgot" component={ForgotPasswordScreen} options={{ title: '' }} />
          </>
        ) : (
          <>
            <Stack.Screen name="Tabs" component={Tabs} options={{ headerShown: false }} />
            <Stack.Screen name="Ejercicio" component={ExerciseDetailScreen} />
            <Stack.Screen name="SimuladorEjercicio" component={SimulatorScreen} options={{ title: 'Simulador' }} />
            <Stack.Screen name="Notificaciones" component={NotificationsScreen} />
            <Stack.Screen name="Configuracion" component={SettingsScreen} options={{ title: 'Configuración' }} />
            <Stack.Screen name="FormEjercicio" component={ExerciseFormScreen} options={{ title: 'Ejercicio' }} />
            <Stack.Screen name="PerfilPublico" component={PublicProfileScreen} options={{ title: 'Perfil' }} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

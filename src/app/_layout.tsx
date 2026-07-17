import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { useEffect } from 'react';
import * as ScreenCapture from 'expo-screen-capture';
import * as SplashScreen from 'expo-splash-screen';
import { Platform, useColorScheme } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { OfflineBanner } from '@/components/offline-banner';
import { AuthProvider, useAuth } from '@/contexts/auth-context';
import { useNotificationResponseNavigation } from '@/hooks/use-notification-response';
import { configureNotificationHandler } from '@/lib/push-notifications';

SplashScreen.preventAutoHideAsync();

// Clé stable et explicite pour éviter tout conflit entre appels
// prevent/allowScreenCaptureAsync (recommandé par la doc expo-screen-capture).
export const SCREEN_CAPTURE_KEY = 'white-alpha-private-screens';

// Sécurisé par défaut dès le chargement du module, avant même le premier
// rendu : FLAG_SECURE (Android) est actif par défaut, y compris pendant
// l'écran de démarrage/chargement de session qui peut déjà contenir des
// éléments d'interface issus d'une session restaurée. Seul l'écran public
// (auth) le désactive explicitement une fois confirmé non authentifié.
// Web n'a pas d'implémentation native : l'appeler y lève une
// UnavailabilityError, donc on ne l'appelle jamais sur cette plateforme.
if (Platform.OS !== 'web') {
  ScreenCapture.preventScreenCaptureAsync(SCREEN_CAPTURE_KEY);
}

// Détermine si les notifications s'affichent pendant que l'app est au
// premier plan, dès le chargement du module — même principe que
// preventScreenCaptureAsync ci-dessus.
configureNotificationHandler();

function RootNavigator() {
  const { isAuthenticated, isLoading } = useAuth();

  // Ouvre la conversation correspondante lorsqu'une notification est
  // touchée, avec revalidation systématique de session et d'appartenance
  // (voir use-notification-response.ts) — jamais à partir des seules
  // données transportées par la notification.
  useNotificationResponseNavigation();

  useEffect(() => {
    if (Platform.OS === 'web') return;
    if (!isLoading && !isAuthenticated) {
      ScreenCapture.allowScreenCaptureAsync(SCREEN_CAPTURE_KEY);
    } else {
      ScreenCapture.preventScreenCaptureAsync(SCREEN_CAPTURE_KEY);
    }
  }, [isAuthenticated, isLoading]);

  // Tant que la session n'a pas été restaurée, le splash natif reste affiché
  // (voir AnimatedSplashOverlay) : la Stack ci-dessous ne devient visible
  // qu'une fois isLoading passé à false.
  return (
    <>
      <AnimatedSplashOverlay ready={!isLoading} />
      {/* Un seul abonnement réseau pour toute l'application (pas un par
          écran) : monté ici, jamais dans (app)/(auth). */}
      <OfflineBanner />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Protected guard={isAuthenticated}>
          <Stack.Screen name="(app)" />
        </Stack.Protected>
        <Stack.Protected guard={!isAuthenticated}>
          <Stack.Screen name="(auth)" />
        </Stack.Protected>
        {/* Accessible quel que soit l'état d'authentification : le lien de
            confirmation email peut être ouvert avant toute connexion. */}
        <Stack.Screen name="auth/callback" />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  const colorScheme = useColorScheme();
  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <AuthProvider>
        <RootNavigator />
      </AuthProvider>
    </ThemeProvider>
  );
}

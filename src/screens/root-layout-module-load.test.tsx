import { Platform } from 'react-native';

// Fichier séparé de root-layout-screen-capture.test.tsx : ce test ne rend
// jamais le composant (aucun hook déclenché), ce qui permet d'utiliser
// jest.resetModules() + require() en toute sécurité pour observer l'appel
// module-level à preventScreenCaptureAsync qui a lieu au chargement de
// src/app/_layout.tsx (avant même le premier rendu — voir le commentaire
// dans ce fichier). Combiner resetModules() avec le rendu d'un composant à
// hooks casse React (deux instances du module "react" en mémoire) : c'est
// pour cela que les tests de rendu vivent dans l'autre fichier, avec un
// import statique.
/* eslint-disable @typescript-eslint/no-require-imports -- jest.resetModules()
   nécessite un require() synchrone pour ré-exécuter le code module-level de
   app/_layout.tsx à chaque test avec un Platform.OS différent. */

jest.mock('expo-screen-capture', () => ({
  preventScreenCaptureAsync: jest.fn().mockResolvedValue(undefined),
  allowScreenCaptureAsync: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('expo-splash-screen', () => ({
  preventAutoHideAsync: jest.fn(),
}));

jest.mock('@/components/animated-icon', () => ({ AnimatedSplashOverlay: () => null }));
jest.mock('@/components/offline-banner', () => ({ OfflineBanner: () => null }));
jest.mock('@/lib/push-notifications', () => ({ configureNotificationHandler: jest.fn() }));
jest.mock('@/hooks/use-notification-response', () => ({ useNotificationResponseNavigation: jest.fn() }));
jest.mock('@expo-google-fonts/inter/400Regular', () => ({ Inter_400Regular: 'Inter_400Regular' }));
jest.mock('@expo-google-fonts/inter/500Medium', () => ({ Inter_500Medium: 'Inter_500Medium' }));
jest.mock('@expo-google-fonts/inter/600SemiBold', () => ({ Inter_600SemiBold: 'Inter_600SemiBold' }));
jest.mock('@expo-google-fonts/inter/700Bold', () => ({ Inter_700Bold: 'Inter_700Bold' }));
jest.mock('@expo-google-fonts/inter/useFonts', () => ({ useFonts: () => [true, null] }));
jest.mock('@/contexts/auth-context', () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
  useAuth: () => ({ isAuthenticated: false, isLoading: true }),
}));
// Isolation identique à AuthProvider/useAuth ci-dessus (Phase 10.2) : évite
// tout accès réel à AsyncStorage via la chaîne appearance-context ->
// use-appearance-preferences -> appearance-storage — ce test ne porte que
// sur l'appel module-level à ScreenCapture, jamais rendu (voir commentaire
// de tête de fichier).
jest.mock('@/contexts/appearance-context', () => ({
  AppearanceProvider: ({ children }: { children: React.ReactNode }) => children,
  useAppearanceContext: () => ({ isLoading: true }),
}));
jest.mock('expo-router', () => ({
  ThemeProvider: ({ children }: { children: React.ReactNode }) => children,
  DarkTheme: {},
  DefaultTheme: {},
  Stack: Object.assign(({ children }: { children: React.ReactNode }) => children, {
    Screen: () => null,
    Protected: () => null,
  }),
}));

const originalPlatformOS = Platform.OS;

beforeEach(() => {
  jest.resetModules();
});

afterEach(() => {
  Platform.OS = originalPlatformOS;
});

describe('app/_layout.tsx — sécurisation par défaut au chargement du module', () => {
  it('sur natif (Android/iOS) : preventScreenCaptureAsync est appelé dès le chargement, avant tout rendu', () => {
    Platform.OS = 'android';

    require('@/app/_layout');
    // require() après le require() du module testé : resetModules() a été
    // vidé une seule fois dans ce test, donc les deux require() partagent
    // la même instance fraîche du mock.
    const ScreenCapture = require('expo-screen-capture');

    expect(ScreenCapture.preventScreenCaptureAsync).toHaveBeenCalledWith('white-alpha-private-screens');
  });

  it('sur web : aucun appel natif au chargement du module (API indisponible)', () => {
    Platform.OS = 'web';

    require('@/app/_layout');
    const ScreenCapture = require('expo-screen-capture');

    expect(ScreenCapture.preventScreenCaptureAsync).not.toHaveBeenCalled();
    expect(ScreenCapture.allowScreenCaptureAsync).not.toHaveBeenCalled();
  });
});

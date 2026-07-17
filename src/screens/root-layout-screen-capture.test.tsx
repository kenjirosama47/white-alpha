import { render } from '@testing-library/react-native';
import * as ScreenCapture from 'expo-screen-capture';
import { Platform } from 'react-native';

import RootLayout, { SCREEN_CAPTURE_KEY } from '@/app/_layout';

// Ce fichier vit délibérément hors de src/app (voir app-layout.test.tsx pour
// l'explication complète : Expo Router embarquerait sinon ce test dans le
// bundle Android de production via require.context).
//
// Import statique (pas jest.resetModules()/require()) : RootLayout utilise
// des hooks React, et resetModules() ferait charger une seconde instance du
// module "react" au moment du require() suivant, cassant le dispatcher de
// hooks (deux copies de React en mémoire). L'appel module-level à
// preventScreenCaptureAsync (une seule fois, au chargement du fichier) est
// donc testé séparément, sans rendu, dans root-layout-module-load.test.tsx.
//
// Les jest.fn() sont créés directement dans la factory (pas dans une
// variable externe) : l'import statique de '@/app/_layout' ci-dessus
// déclenche l'appel module-level à preventScreenCaptureAsync avant que le
// corps du fichier (hors imports) ait fini de s'exécuter — une variable
// `const` externe référencée depuis la factory serait encore non assignée
// à ce moment-là.
jest.mock('expo-screen-capture', () => ({
  preventScreenCaptureAsync: jest.fn().mockResolvedValue(undefined),
  allowScreenCaptureAsync: jest.fn().mockResolvedValue(undefined),
}));

const mockPreventScreenCapture = ScreenCapture.preventScreenCaptureAsync as jest.Mock;
const mockAllowScreenCapture = ScreenCapture.allowScreenCaptureAsync as jest.Mock;

jest.mock('expo-splash-screen', () => ({
  preventAutoHideAsync: jest.fn(),
}));

jest.mock('@/components/animated-icon', () => ({
  AnimatedSplashOverlay: () => null,
}));

jest.mock('@/components/offline-banner', () => ({
  OfflineBanner: () => null,
}));

jest.mock('@/lib/push-notifications', () => ({
  configureNotificationHandler: jest.fn(),
}));

jest.mock('@/hooks/use-notification-response', () => ({
  useNotificationResponseNavigation: jest.fn(),
}));

jest.mock('@expo-google-fonts/inter/400Regular', () => ({ Inter_400Regular: 'Inter_400Regular' }));
jest.mock('@expo-google-fonts/inter/500Medium', () => ({ Inter_500Medium: 'Inter_500Medium' }));
jest.mock('@expo-google-fonts/inter/600SemiBold', () => ({ Inter_600SemiBold: 'Inter_600SemiBold' }));
jest.mock('@expo-google-fonts/inter/700Bold', () => ({ Inter_700Bold: 'Inter_700Bold' }));
jest.mock('@expo-google-fonts/inter/useFonts', () => ({ useFonts: () => [true, null] }));

const mockUseAuth = jest.fn();
jest.mock('@/contexts/auth-context', () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
  useAuth: () => mockUseAuth(),
}));

jest.mock('expo-router', () => {
  const ReactActual = jest.requireActual('react');
  const { Text: RNText } = jest.requireActual('react-native');
  const Screen = ({ name }: { name: string }) => ReactActual.createElement(RNText, null, name);
  const Protected = ({ guard, children }: { guard: boolean; children: React.ReactNode }) =>
    guard ? ReactActual.createElement(ReactActual.Fragment, null, children) : null;
  return {
    ThemeProvider: ({ children }: { children: React.ReactNode }) => children,
    DarkTheme: {},
    DefaultTheme: {},
    Stack: Object.assign(
      ({ children }: { children: React.ReactNode }) => ReactActual.createElement(ReactActual.Fragment, null, children),
      { Screen, Protected },
    ),
  };
});

const originalPlatformOS = Platform.OS;

beforeEach(() => {
  mockPreventScreenCapture.mockClear();
  mockAllowScreenCapture.mockClear();
  Platform.OS = 'android';
});

afterEach(() => {
  Platform.OS = originalPlatformOS;
});

describe('RootLayout — protection écran (Phase 5.S2)', () => {
  it('utilisateur authentifié : la protection reste active', async () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: true, isLoading: false });

    await render(<RootLayout />);

    expect(mockPreventScreenCapture).toHaveBeenCalledWith(SCREEN_CAPTURE_KEY);
    expect(mockAllowScreenCapture).not.toHaveBeenCalled();
  });

  it('écran public (non authentifié, chargement terminé) : la protection est levée', async () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: false, isLoading: false });

    await render(<RootLayout />);

    expect(mockAllowScreenCapture).toHaveBeenCalledWith(SCREEN_CAPTURE_KEY);
  });

  it('pendant le chargement de la session (isLoading), la protection reste active (pas encore confirmé public)', async () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: false, isLoading: true });

    await render(<RootLayout />);

    expect(mockAllowScreenCapture).not.toHaveBeenCalled();
    expect(mockPreventScreenCapture).toHaveBeenCalledWith(SCREEN_CAPTURE_KEY);
  });

  it('activation après connexion : passage de public à authentifié réactive la protection', async () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: false, isLoading: false });

    const { rerender } = await render(<RootLayout />);
    expect(mockAllowScreenCapture).toHaveBeenCalledTimes(1);
    mockPreventScreenCapture.mockClear();

    mockUseAuth.mockReturnValue({ isAuthenticated: true, isLoading: false });
    await rerender(<RootLayout />);

    expect(mockPreventScreenCapture).toHaveBeenCalledWith(SCREEN_CAPTURE_KEY);
  });

  it("suppression après déconnexion : passage d'authentifié à public lève la protection", async () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: true, isLoading: false });

    const { rerender } = await render(<RootLayout />);
    mockAllowScreenCapture.mockClear();

    mockUseAuth.mockReturnValue({ isAuthenticated: false, isLoading: false });
    await rerender(<RootLayout />);

    expect(mockAllowScreenCapture).toHaveBeenCalledWith(SCREEN_CAPTURE_KEY);
  });

  it('navigation entre écrans privés (ré-affichages successifs, état authentifié inchangé) : aucune levée de protection', async () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: true, isLoading: false });

    const { rerender } = await render(<RootLayout />);

    await rerender(<RootLayout />);
    await rerender(<RootLayout />);

    expect(mockAllowScreenCapture).not.toHaveBeenCalled();
  });

  it("pas de double activation conflictuelle : un ré-affichage sans changement d'état n'appelle pas de nouveau prevent/allow", async () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: true, isLoading: false });

    const { rerender } = await render(<RootLayout />);
    mockPreventScreenCapture.mockClear();

    await rerender(<RootLayout />);

    // Les dépendances de l'effet (isAuthenticated, isLoading) sont
    // inchangées : React ne relance pas l'effet, donc aucun nouvel appel.
    expect(mockPreventScreenCapture).not.toHaveBeenCalled();
  });

  it("web : aucun appel à l'API native pendant le rendu (indisponible sur cette plateforme)", async () => {
    Platform.OS = 'web';
    mockUseAuth.mockReturnValue({ isAuthenticated: true, isLoading: false });

    await render(<RootLayout />);

    expect(mockPreventScreenCapture).not.toHaveBeenCalled();
    expect(mockAllowScreenCapture).not.toHaveBeenCalled();
  });
});

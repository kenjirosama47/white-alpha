import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { FadeIn } from 'react-native-reanimated';

import WelcomeScreen from '@/app/(auth)/index';
import { Colors } from '@/constants/theme';
import { useReducedMotion } from '@/hooks/use-reduced-motion';

// Mock local (indépendant du mock global de jest.setup.js, qui simule
// uniquement le module react-native-reanimated) : contrôle directement ce
// que le hook applicatif @/hooks/use-reduced-motion renvoie, pour vérifier
// que WelcomeScreen respecte bien le réglage système « Réduire les
// animations » (Phase 7.6).
jest.mock('@/hooks/use-reduced-motion', () => ({
  useReducedMotion: jest.fn(() => false),
}));

const mockUseReducedMotion = useReducedMotion as jest.Mock;

// Ce fichier vit délibérément hors de src/app (voir app-layout.test.tsx pour
// l'explication complète : Expo Router embarquerait sinon ce test dans le
// bundle Android de production via require.context).
//
// Historique (Phase 7.3 puis build 16, design White Alpha) : ces deux
// boutons utilisaient <Link asChild>, qui délègue la fusion des props
// enfant/parent à @radix-ui/react-slot (expo-router ui/Slot.js). Un premier
// bug (style perdu si fonction/tableau non aplati) avait été corrigé en
// Phase 7.3. Un second bug, plus grave, n'a été détecté qu'au test manuel
// réel du build 16 (texte des boutons tronqué à l'affichage — « Se » au lieu
// de « Se connecter », etc. — alors que le contenu accessible restait
// correct) : Jest ne fait aucune vraie mesure de layout (Yoga), ce bug de
// rendu Fabric/Slot était donc invisible en test. Corrigé en abandonnant
// <Link asChild> au profit d'un Pressable simple + `router.push(...)`, le
// même mécanisme que tous les autres écrans de navigation de l'app (voir
// profile.tsx, security.tsx) — plus aucune dépendance à Slot.
const mockRouterPush = jest.fn();
jest.mock('expo-router', () => ({
  router: { push: (...args: unknown[]) => mockRouterPush(...args) },
}));

function flattenStyle(style: unknown): Record<string, unknown> {
  const flat = ([style] as unknown[]).flat(Infinity).filter(Boolean) as Record<string, unknown>[];
  return flat.reduce((acc, s) => ({ ...acc, ...s }), {});
}

describe('WelcomeScreen — textes officiels White Alpha (Phase 7.3)', () => {
  it('affiche le titre et le sous-titre officiels', async () => {
    await render(<WelcomeScreen />);

    expect(screen.getByText('Bienvenue dans White Alpha')).toBeTruthy();
    expect(screen.getByText('La meute privée. Vos échanges restent entre vous.')).toBeTruthy();
  });

  it("affiche l'illustration officielle du loup", async () => {
    await render(<WelcomeScreen />);

    expect(screen.getByLabelText('Loup blanc White Alpha')).toBeTruthy();
  });

  it("ne contient aucune référence visible à Claude ou à l'ancien nom", async () => {
    await render(<WelcomeScreen />);

    expect(screen.queryByText(/claude/i)).toBeNull();
    expect(screen.queryByText(/Discussion Privée/i)).toBeNull();
  });
});

describe('WelcomeScreen — boutons Se connecter / Créer un compte', () => {
  beforeEach(() => {
    mockRouterPush.mockReset();
  });

  it('un tap sur « Se connecter » navigue vers /login (pas de <Link asChild>/Slot)', async () => {
    await render(<WelcomeScreen />);

    fireEvent.press(screen.getByText('Se connecter'));

    expect(mockRouterPush).toHaveBeenCalledWith('/login');
  });

  it('un tap sur « Créer un compte » navigue vers /register (pas de <Link asChild>/Slot)', async () => {
    await render(<WelcomeScreen />);

    fireEvent.press(screen.getByText('Créer un compte'));

    expect(mockRouterPush).toHaveBeenCalledWith('/register');
  });

  it('le bouton « Se connecter » utilise le vert forêt (accent) au repos', async () => {
    await render(<WelcomeScreen />);

    const label = screen.getByText('Se connecter');
    expect(flattenStyle(label.parent?.props.style)).toMatchObject({ backgroundColor: Colors.light.accent });
  });

  it('le texte « Se connecter » utilise la couleur de texte sur accent (onAccent)', async () => {
    await render(<WelcomeScreen />);

    const label = screen.getByText('Se connecter');
    expect(flattenStyle(label.props.style).color).toBe(Colors.light.onAccent);
  });

  it('le bouton « Créer un compte » a une bordure visible', async () => {
    await render(<WelcomeScreen />);

    const label = screen.getByText('Créer un compte');
    expect(flattenStyle(label.parent?.props.style)).toMatchObject({ borderWidth: 1, borderColor: Colors.light.border });
  });

  it('état pressé : le bouton principal applique une opacité réduite sans perdre son fond accent', async () => {
    await render(<WelcomeScreen />);

    const label = screen.getByText('Se connecter');
    const pressable = label.parent;
    if (!pressable) throw new Error('Pressable introuvable');

    await act(async () => {
      fireEvent(pressable, 'pressIn');
      await Promise.resolve();
    });

    expect(flattenStyle(pressable.props.style)).toMatchObject({ backgroundColor: Colors.light.accent, opacity: 0.7 });
  });

  it('état pressé : le bouton secondaire applique une opacité réduite sans perdre sa bordure', async () => {
    await render(<WelcomeScreen />);

    const label = screen.getByText('Créer un compte');
    const pressable = label.parent;
    if (!pressable) throw new Error('Pressable introuvable');

    await act(async () => {
      fireEvent(pressable, 'pressIn');
      await Promise.resolve();
    });

    expect(flattenStyle(pressable.props.style)).toMatchObject({ borderWidth: 1, opacity: 0.7 });
  });

  it('un appui complet sur le bouton principal ne fait pas perdre le fond accent au repos', async () => {
    await render(<WelcomeScreen />);

    const label = screen.getByText('Se connecter');
    fireEvent.press(label);

    expect(flattenStyle(label.parent?.props.style)).toMatchObject({ backgroundColor: Colors.light.accent });
  });

  it('un appui complet sur le bouton secondaire ne fait pas perdre la bordure au repos', async () => {
    await render(<WelcomeScreen />);

    const label = screen.getByText('Créer un compte');
    fireEvent.press(label);

    expect(flattenStyle(label.parent?.props.style)).toMatchObject({ borderWidth: 1, borderColor: Colors.light.border });
  });
});

describe('WelcomeScreen — réduction des animations (Phase 7.6)', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("joue l'apparition progressive quand « Réduire les animations » est désactivé", async () => {
    mockUseReducedMotion.mockReturnValue(false);
    const durationSpy = jest.spyOn(FadeIn, 'duration');

    await render(<WelcomeScreen />);

    expect(durationSpy).toHaveBeenCalledWith(500);
  });

  it("n'applique aucune animation d'entrée quand « Réduire les animations » est activé", async () => {
    mockUseReducedMotion.mockReturnValue(true);
    const durationSpy = jest.spyOn(FadeIn, 'duration');

    await render(<WelcomeScreen />);

    expect(durationSpy).not.toHaveBeenCalled();
  });
});

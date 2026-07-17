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
// Cause confirmée (test manuel réel sur émulateur Android API 36 + lecture
// du code source d'expo-router) : <Link asChild> délègue la fusion des
// props enfant/parent à @radix-ui/react-slot (voir
// node_modules/expo-router/build/ui/Slot.js), qui fusionne `style` par
// spread d'objet (`{...style}`) et n'accepte qu'un objet déjà aplati.
// - style={({pressed}) => [...]} (fonction) : une fonction n'a aucune
//   propriété propre énumérable, `{...fn}` produit un objet vide — tout le
//   style disparaît silencieusement en production (constaté : fond bleu et
//   bordure jamais peints, texte blanc invisible sur fond blanc ; layout
//   correct car dérivé du flex du parent et du texte, pas du style disparu).
// - style={[a, b]} (tableau, même hors fonction) : Slot le détecte
//   explicitement et lève une erreur en dev ("You are passing an array of
//   styles to a child of <Slot>. Consider flattening the styles with
//   StyleSheet.flatten...") — confirmé en reproduisant l'erreur réelle.
// Corrigé en appelant StyleSheet.flatten([...]) directement (jamais dans un
// callback, jamais un tableau brut) pour un enfant direct de <Link asChild>,
// l'état pressed étant géré via useState + onPressIn/onPressOut. Toujours
// vrai après la refonte Phase 7.3 (garde-fou reconduit ci-dessous avec les
// nouvelles couleurs du Design System).
jest.mock('expo-router', () => {
  const ReactActual = jest.requireActual('react');
  return {
    Link: ({ asChild, children }: { asChild?: boolean; children: React.ReactNode }) =>
      asChild ? children : ReactActual.createElement(ReactActual.Fragment, null, children),
  };
});

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
  it('le style du bouton principal est un objet déjà aplati, jamais une fonction ni un tableau (garde-fou anti-régression Link asChild + Slot)', async () => {
    await render(<WelcomeScreen />);

    const label = screen.getByText('Se connecter');
    const style = label.parent?.props.style;
    expect(typeof style).not.toBe('function');
    expect(Array.isArray(style)).toBe(false);
  });

  it('le style du bouton secondaire est un objet déjà aplati, jamais une fonction ni un tableau (garde-fou anti-régression Link asChild + Slot)', async () => {
    await render(<WelcomeScreen />);

    const label = screen.getByText('Créer un compte');
    const style = label.parent?.props.style;
    expect(typeof style).not.toBe('function');
    expect(Array.isArray(style)).toBe(false);
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

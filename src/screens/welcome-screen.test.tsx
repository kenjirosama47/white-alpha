import { act, fireEvent, render, screen } from '@testing-library/react-native';

import WelcomeScreen from '@/app/(auth)/index';

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
// l'état pressed étant géré via useState + onPressIn/onPressOut.
jest.mock('expo-router', () => {
  const ReactActual = jest.requireActual('react');
  return {
    Link: ({ asChild, children }: { asChild?: boolean; children: React.ReactNode }) =>
      asChild ? children : ReactActual.createElement(ReactActual.Fragment, null, children),
  };
});

// AnimatedIcon (react-native-reanimated/worklets) n'a pas de mock natif
// disponible dans cet environnement Jest ; hors sujet pour ces tests, qui ne
// portent que sur le style des boutons.
jest.mock('@/components/animated-icon', () => ({
  AnimatedIcon: () => null,
}));

function flattenStyle(style: unknown): Record<string, unknown> {
  const flat = ([style] as unknown[]).flat(Infinity).filter(Boolean) as Record<string, unknown>[];
  return flat.reduce((acc, s) => ({ ...acc, ...s }), {});
}

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

  it('le bouton « Se connecter » a un fond bleu explicite au repos', async () => {
    await render(<WelcomeScreen />);

    const label = screen.getByText('Se connecter');
    expect(flattenStyle(label.parent?.props.style)).toMatchObject({ backgroundColor: '#208AEF' });
  });

  it('le texte « Se connecter » est explicitement blanc', async () => {
    await render(<WelcomeScreen />);

    const label = screen.getByText('Se connecter');
    expect(flattenStyle(label.props.style).color).toBe('#ffffff');
  });

  it('le bouton « Créer un compte » a une bordure visible sur fond blanc', async () => {
    await render(<WelcomeScreen />);

    const label = screen.getByText('Créer un compte');
    expect(flattenStyle(label.parent?.props.style)).toMatchObject({ borderWidth: 1, borderColor: '#60646C' });
  });

  it('état pressé : le bouton principal applique une opacité réduite sans perdre son fond bleu', async () => {
    await render(<WelcomeScreen />);

    const label = screen.getByText('Se connecter');
    const pressable = label.parent;
    if (!pressable) throw new Error('Pressable introuvable');

    await act(async () => {
      fireEvent(pressable, 'pressIn');
      await Promise.resolve();
    });

    expect(flattenStyle(pressable.props.style)).toMatchObject({ backgroundColor: '#208AEF', opacity: 0.7 });
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

  it('un appui complet sur le bouton principal ne fait pas perdre le fond bleu au repos', async () => {
    await render(<WelcomeScreen />);

    const label = screen.getByText('Se connecter');
    fireEvent.press(label);

    expect(flattenStyle(label.parent?.props.style)).toMatchObject({ backgroundColor: '#208AEF' });
  });

  it('un appui complet sur le bouton secondaire ne fait pas perdre la bordure au repos', async () => {
    await render(<WelcomeScreen />);

    const label = screen.getByText('Créer un compte');
    fireEvent.press(label);

    expect(flattenStyle(label.parent?.props.style)).toMatchObject({ borderWidth: 1, borderColor: '#60646C' });
  });
});

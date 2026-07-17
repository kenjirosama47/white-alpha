import { render } from '@testing-library/react-native';
import { createRef } from 'react';
import { View } from 'react-native';

import { restoreAccessibilityFocus } from '@/utils/accessibility-focus';

// Ces tests utilisent le vrai react-native (aucun mock de module) : la
// résolution d'un vrai node handle et l'appel réel à
// AccessibilityInfo.setAccessibilityFocus ne peuvent pas être simulés
// fidèlement sans passer par un composant réellement monté (voir les tests
// de câblage, plus précis, dans image-viewer-modal.test.tsx et
// message-video.test.tsx, qui mockent ce module directement).
describe('restoreAccessibilityFocus', () => {
  it("ne fait rien et ne plante jamais si aucune référence n'est fournie (référence absente)", () => {
    expect(() => restoreAccessibilityFocus(null)).not.toThrow();
  });

  it('ne plante jamais quand appelée avec la référence d’un élément réellement monté', async () => {
    const ref = createRef<View>();
    await render(<View ref={ref} />);

    expect(ref.current).not.toBeNull();
    expect(() => restoreAccessibilityFocus(ref.current)).not.toThrow();
  });

  it('ne plante jamais avec un objet quelconque ne correspondant à aucun composant React (handle introuvable)', () => {
    expect(() => restoreAccessibilityFocus({ notAComponent: true })).not.toThrow();
  });
});

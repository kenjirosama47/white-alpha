import { render, screen } from '@testing-library/react-native';

import { ThemedText } from '@/components/themed-text';

describe('ThemedText', () => {
  it.each(['default', 'title', 'small', 'smallBold', 'subtitle', 'link', 'linkPrimary', 'code'] as const)(
    'type hérité "%s" : rend le texte sans erreur (non-régression Phase 5/6)',
    async (type) => {
      await render(<ThemedText type={type}>Texte</ThemedText>);

      expect(screen.getByText('Texte')).toBeTruthy();
    },
  );

  it.each(['display', 'title', 'subtitle', 'body', 'bodySmall', 'label', 'caption'] as const)(
    'type Phase 7.1 "%s" : rend le texte sans erreur',
    async (type) => {
      await render(<ThemedText type={type}>Texte</ThemedText>);

      expect(screen.getByText('Texte')).toBeTruthy();
    },
  );

  it('applique maxFontSizeMultiplier pour les nouvelles variantes typographiques', async () => {
    await render(<ThemedText type="display">Titre</ThemedText>);

    expect(screen.getByText('Titre').props.maxFontSizeMultiplier).toBeGreaterThan(1);
  });

  it('un maxFontSizeMultiplier explicite prime sur la valeur par défaut de la variante', async () => {
    await render(
      <ThemedText type="display" maxFontSizeMultiplier={1}>
        Titre
      </ThemedText>,
    );

    expect(screen.getByText('Titre').props.maxFontSizeMultiplier).toBe(1);
  });
});

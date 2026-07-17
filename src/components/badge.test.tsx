import { render, screen } from '@testing-library/react-native';

import { Badge } from '@/components/badge';

describe('Badge', () => {
  it('affiche son libellé', async () => {
    await render(<Badge label="Propriétaire" />);

    expect(screen.getByText('Propriétaire')).toBeTruthy();
  });

  it.each(['accent', 'neutral', 'danger', 'warning'] as const)('ton %s : rend sans erreur', async (tone) => {
    await render(<Badge label="Statut" tone={tone} />);

    expect(screen.getByText('Statut')).toBeTruthy();
  });
});

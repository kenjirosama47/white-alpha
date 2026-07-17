import { render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { Card } from '@/components/card';

describe('Card', () => {
  it('rend son contenu', async () => {
    await render(
      <Card>
        <Text>Contenu</Text>
      </Card>,
    );

    expect(screen.getByText('Contenu')).toBeTruthy();
  });

  it('padded=false et elevated=true ne lèvent aucune erreur de rendu', async () => {
    await render(
      <Card padded={false} elevated testID="card">
        <Text>Contenu</Text>
      </Card>,
    );

    expect(screen.getByText('Contenu')).toBeTruthy();
  });
});

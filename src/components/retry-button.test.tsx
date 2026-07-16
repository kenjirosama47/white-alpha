import { fireEvent, render, screen } from '@testing-library/react-native';

import { RetryButton } from '@/components/retry-button';

describe('RetryButton', () => {
  it('affiche "Réessayer" par défaut et appelle onPress au tap', async () => {
    const onPress = jest.fn();
    await render(<RetryButton onPress={onPress} />);

    fireEvent.press(screen.getByText('Réessayer'));

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('accepte un libellé personnalisé', async () => {
    await render(<RetryButton onPress={jest.fn()} label="Recharger" />);

    expect(screen.getByText('Recharger')).toBeTruthy();
  });

  it('expose un accessibilityLabel et accessibilityRole="button"', async () => {
    await render(<RetryButton onPress={jest.fn()} accessibilityLabel="Réessayer le chargement" />);

    const button = screen.getByLabelText('Réessayer le chargement');
    expect(button.props.accessibilityRole).toBe('button');
  });
});

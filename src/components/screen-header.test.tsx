import { fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import { Text } from 'react-native';

import { ScreenHeader } from '@/components/screen-header';

jest.mock('expo-router', () => ({
  router: { back: jest.fn() },
}));

describe('ScreenHeader', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('affiche le titre et le bouton Retour', async () => {
    await render(<ScreenHeader title="Sécurité" />);

    expect(screen.getByText('Sécurité')).toBeTruthy();
    expect(screen.getByText('Retour')).toBeTruthy();
  });

  it('appelle router.back() par défaut au tap sur Retour', async () => {
    await render(<ScreenHeader title="Sécurité" />);
    fireEvent.press(screen.getByText('Retour'));

    expect(router.back).toHaveBeenCalledTimes(1);
  });

  it('appelle onBack personnalisé au lieu de router.back() quand fourni', async () => {
    const onBack = jest.fn();
    await render(<ScreenHeader title="Sécurité" onBack={onBack} />);
    fireEvent.press(screen.getByText('Retour'));

    expect(onBack).toHaveBeenCalledTimes(1);
    expect(router.back).not.toHaveBeenCalled();
  });

  it('affiche rightElement quand fourni', async () => {
    await render(<ScreenHeader title="Profil" rightElement={<Text>Modifier</Text>} />);

    expect(screen.getByText('Modifier')).toBeTruthy();
  });
});

import { fireEvent, render, screen } from '@testing-library/react-native';

import { Button } from '@/components/button';

describe('Button', () => {
  it('affiche son libellé et appelle onPress au tap', async () => {
    const onPress = jest.fn();
    await render(<Button label="Se connecter" onPress={onPress} />);

    fireEvent.press(screen.getByText('Se connecter'));

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('expose accessibilityRole="button" et un accessibilityLabel par défaut égal au libellé', async () => {
    await render(<Button label="Créer un compte" onPress={jest.fn()} />);

    const button = screen.getByLabelText('Créer un compte');
    expect(button.props.accessibilityRole).toBe('button');
  });

  it('accepte un accessibilityLabel personnalisé', async () => {
    await render(<Button label="OK" onPress={jest.fn()} accessibilityLabel="Confirmer la suppression" />);

    expect(screen.getByLabelText('Confirmer la suppression')).toBeTruthy();
  });

  it('disabled=true : onPress ne se déclenche pas au tap', async () => {
    const onPress = jest.fn();
    await render(<Button label="Envoyer" onPress={onPress} disabled />);

    fireEvent.press(screen.getByText('Envoyer'));

    expect(onPress).not.toHaveBeenCalled();
  });

  it('loading=true : affiche un indicateur au lieu du libellé et désactive le bouton', async () => {
    const onPress = jest.fn();
    await render(<Button label="Envoyer" onPress={onPress} loading />);

    expect(screen.queryByText('Envoyer')).toBeNull();
    const button = screen.getByLabelText('Envoyer');
    expect(button.props.accessibilityState).toEqual(expect.objectContaining({ disabled: true, busy: true }));

    fireEvent.press(button);
    expect(onPress).not.toHaveBeenCalled();
  });

  it.each(['primary', 'secondary', 'danger', 'ghost'] as const)('variante %s : rend le libellé sans lever d\'erreur', async (variant) => {
    await render(<Button label="Action" onPress={jest.fn()} variant={variant} />);

    expect(screen.getByText('Action')).toBeTruthy();
  });
});

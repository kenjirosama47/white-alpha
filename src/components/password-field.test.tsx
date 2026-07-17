import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { PasswordField } from '@/components/password-field';

describe('PasswordField', () => {
  it('masque le mot de passe par défaut (secureTextEntry)', async () => {
    await render(<PasswordField value="" onChangeText={jest.fn()} placeholder="Mot de passe" />);

    expect(screen.getByPlaceholderText('Mot de passe').props.secureTextEntry).toBe(true);
  });

  it('désactive systématiquement autoCorrect et autoCapitalize', async () => {
    await render(<PasswordField value="" onChangeText={jest.fn()} placeholder="Mot de passe" />);

    const input = screen.getByPlaceholderText('Mot de passe');
    expect(input.props.autoCorrect).toBe(false);
    expect(input.props.autoCapitalize).toBe('none');
  });

  it('le bouton Afficher révèle le mot de passe (secureTextEntry passe à false), puis Masquer le recache', async () => {
    await render(<PasswordField value="motdepasse" onChangeText={jest.fn()} placeholder="Mot de passe" />);

    await act(async () => {
      fireEvent.press(screen.getByLabelText('Afficher le mot de passe'));
    });
    expect(screen.getByPlaceholderText('Mot de passe').props.secureTextEntry).toBe(false);

    await act(async () => {
      fireEvent.press(screen.getByLabelText('Masquer le mot de passe'));
    });
    expect(screen.getByPlaceholderText('Mot de passe').props.secureTextEntry).toBe(true);
  });

  it("affiche le label et le message d'erreur transmis", async () => {
    await render(
      <PasswordField
        value=""
        onChangeText={jest.fn()}
        label="Mot de passe"
        error="Mot de passe trop court"
      />,
    );

    expect(screen.getByText('Mot de passe')).toBeTruthy();
    expect(screen.getByText('Mot de passe trop court')).toBeTruthy();
  });
});

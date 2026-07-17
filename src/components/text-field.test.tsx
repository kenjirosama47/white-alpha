import { fireEvent, render, screen } from '@testing-library/react-native';

import { TextField } from '@/components/text-field';

describe('TextField', () => {
  it('affiche le label et transmet la saisie via onChangeText', async () => {
    const onChangeText = jest.fn();
    await render(<TextField label="Email" value="" onChangeText={onChangeText} placeholder="Email" />);

    expect(screen.getByText('Email')).toBeTruthy();
    fireEvent.changeText(screen.getByPlaceholderText('Email'), 'a@test.local');

    expect(onChangeText).toHaveBeenCalledWith('a@test.local');
  });

  it("affiche le message d'erreur quand `error` est défini", async () => {
    await render(<TextField value="" onChangeText={jest.fn()} error="Champ invalide" placeholder="Champ" />);

    expect(screen.getByText('Champ invalide')).toBeTruthy();
  });

  it("n'affiche aucun message d'erreur par défaut", async () => {
    await render(<TextField value="" onChangeText={jest.fn()} placeholder="Champ" />);

    expect(screen.queryByText(/invalide|erreur/i)).toBeNull();
  });

  it('conserve les autres props TextInput transmises (ex. secureTextEntry)', async () => {
    await render(<TextField value="" onChangeText={jest.fn()} placeholder="Mot de passe" secureTextEntry />);

    expect(screen.getByPlaceholderText('Mot de passe').props.secureTextEntry).toBe(true);
  });
});

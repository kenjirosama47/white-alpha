import { fireEvent, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { AuthScreenShell } from '@/components/auth-screen-shell';

describe('AuthScreenShell', () => {
  it('affiche le titre, le sous-titre et le contenu', async () => {
    await render(
      <AuthScreenShell title="Retrouvez la meute" subtitle="Connectez-vous pour accéder à vos conversations privées.">
        <Text>Contenu du formulaire</Text>
      </AuthScreenShell>,
    );

    expect(screen.getByText('Retrouvez la meute')).toBeTruthy();
    expect(screen.getByText('Connectez-vous pour accéder à vos conversations privées.')).toBeTruthy();
    expect(screen.getByText('Contenu du formulaire')).toBeTruthy();
  });

  it('fonctionne sans sous-titre (optionnel)', async () => {
    await render(
      <AuthScreenShell title="Titre seul">
        <Text>Contenu</Text>
      </AuthScreenShell>,
    );

    expect(screen.getByText('Titre seul')).toBeTruthy();
  });

  it('affiche footer quand fourni', async () => {
    await render(
      <AuthScreenShell title="Titre" footer={<Text>Pas encore de compte ?</Text>}>
        <Text>Contenu</Text>
      </AuthScreenShell>,
    );

    expect(screen.getByText('Pas encore de compte ?')).toBeTruthy();
  });

  it("n'affiche aucun bouton Retour si onBack est omis", async () => {
    await render(
      <AuthScreenShell title="Titre">
        <Text>Contenu</Text>
      </AuthScreenShell>,
    );

    expect(screen.queryByText('Retour')).toBeNull();
  });

  it('affiche et déclenche onBack quand fourni', async () => {
    const onBack = jest.fn();
    await render(
      <AuthScreenShell title="Titre" onBack={onBack}>
        <Text>Contenu</Text>
      </AuthScreenShell>,
    );

    fireEvent.press(screen.getByText('Retour'));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});

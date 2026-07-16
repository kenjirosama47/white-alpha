import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import ProfileScreen from '@/app/(app)/profile';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
}));

const mockSignOut = jest.fn();
let mockSession: { user: { id: string; email?: string } } | null = { user: { id: 'user-1', email: 'kenjiro@example.com' } };
jest.mock('@/contexts/auth-context', () => ({
  useAuth: () => ({ session: mockSession, signOut: mockSignOut }),
}));

const mockUseMyProfile = jest.fn();
jest.mock('@/hooks/use-my-profile', () => ({
  useMyProfile: () => mockUseMyProfile(),
}));

const mockUseProfileEditor = jest.fn();
jest.mock('@/hooks/use-profile-editor', () => ({
  useProfileEditor: (...args: unknown[]) => mockUseProfileEditor(...args),
}));

const baseProfile = {
  id: 'user-1',
  username: 'kenjiro47',
  displayName: 'Kenjiro',
  avatarUrl: null,
  avatarPath: null,
};

function baseProfileState(overrides: Partial<ReturnType<typeof mockUseMyProfile>> = {}) {
  return {
    profile: baseProfile,
    isLoading: false,
    error: null,
    refresh: jest.fn(),
    setProfile: jest.fn(),
    ...overrides,
  };
}

function baseEditorState(overrides: Partial<ReturnType<typeof mockUseProfileEditor>> = {}) {
  return {
    username: baseProfile.username,
    setUsername: jest.fn(),
    displayName: baseProfile.displayName,
    setDisplayName: jest.fn(),
    pickedAvatar: null,
    avatarError: null,
    pickAvatar: jest.fn(),
    cancelAvatar: jest.fn(),
    isDirty: false,
    isSaving: false,
    error: null,
    success: false,
    save: jest.fn(),
    ...overrides,
  };
}

describe('ProfileScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSession = { user: { id: 'user-1', email: 'kenjiro@example.com' } };
    mockUseProfileEditor.mockReturnValue(baseEditorState());
  });

  it('affiche un état de chargement pendant la première récupération', async () => {
    mockUseMyProfile.mockReturnValue(baseProfileState({ profile: null, isLoading: true }));

    await render(<ProfileScreen />);

    expect(screen.queryByText('Kenjiro')).toBeNull();
  });

  it("affiche une erreur française avec un bouton Réessayer qui relance refresh", async () => {
    const refresh = jest.fn();
    mockUseMyProfile.mockReturnValue(
      baseProfileState({ profile: null, error: 'Impossible de charger le profil pour le moment.', refresh }),
    );

    await render(<ProfileScreen />);

    expect(screen.getByText('Impossible de charger le profil pour le moment.')).toBeTruthy();
    fireEvent.press(screen.getByText('Réessayer'));
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('affiche le nom affiché, le @username et les actions principales', async () => {
    mockUseMyProfile.mockReturnValue(baseProfileState());

    await render(<ProfileScreen />);

    expect(screen.getByText('Kenjiro')).toBeTruthy();
    expect(screen.getByText('@kenjiro47')).toBeTruthy();
    expect(screen.getByText('Modifier le profil')).toBeTruthy();
    expect(screen.getByText('Se déconnecter')).toBeTruthy();
  });

  it("n'expose jamais d'email d'un autre utilisateur : seule la propre adresse (session) apparaît, dans Paramètres", async () => {
    mockUseMyProfile.mockReturnValue(baseProfileState());

    await render(<ProfileScreen />);

    expect(screen.getByText('kenjiro@example.com')).toBeTruthy();
  });

  it('bascule vers le formulaire d’édition au tap sur « Modifier le profil »', async () => {
    mockUseMyProfile.mockReturnValue(baseProfileState());

    await render(<ProfileScreen />);
    fireEvent.press(await screen.findByText('Modifier le profil'));

    expect(await screen.findByText('Enregistrer')).toBeTruthy();
  });

  it("le bouton Enregistrer est désactivé tant qu'aucune modification n'a été faite (isDirty=false)", async () => {
    mockUseMyProfile.mockReturnValue(baseProfileState());
    const editorState = baseEditorState({ isDirty: false });
    mockUseProfileEditor.mockReturnValue(editorState);

    await render(<ProfileScreen />);
    fireEvent.press(await screen.findByText('Modifier le profil'));
    fireEvent.press(await screen.findByText('Enregistrer'));

    expect(editorState.save).not.toHaveBeenCalled();
  });

  it('affiche « Enregistrement… » pendant la sauvegarde', async () => {
    mockUseMyProfile.mockReturnValue(baseProfileState());
    mockUseProfileEditor.mockReturnValue(baseEditorState({ isDirty: true, isSaving: true }));

    await render(<ProfileScreen />);
    fireEvent.press(await screen.findByText('Modifier le profil'));

    expect(await screen.findByText('Enregistrement…')).toBeTruthy();
  });

  it("affiche une erreur de validation (ex. nom d'utilisateur déjà pris) sans perdre la saisie", async () => {
    mockUseMyProfile.mockReturnValue(baseProfileState());
    mockUseProfileEditor.mockReturnValue(
      baseEditorState({ username: 'dejapris', isDirty: true, error: "Ce nom d'utilisateur est déjà utilisé." }),
    );

    await render(<ProfileScreen />);
    fireEvent.press(await screen.findByText('Modifier le profil'));

    expect(await screen.findByText("Ce nom d'utilisateur est déjà utilisé.")).toBeTruthy();
    expect(screen.getByDisplayValue('dejapris')).toBeTruthy();
  });

  it('affiche une confirmation de succès après un enregistrement réussi', async () => {
    mockUseMyProfile.mockReturnValue(baseProfileState());
    mockUseProfileEditor.mockReturnValue(baseEditorState({ success: true }));

    await render(<ProfileScreen />);
    fireEvent.press(await screen.findByText('Modifier le profil'));

    expect(await screen.findByText('Profil mis à jour.')).toBeTruthy();
  });

  it('demande une confirmation avant de se déconnecter', async () => {
    mockUseMyProfile.mockReturnValue(baseProfileState());

    await render(<ProfileScreen />);
    fireEvent.press(await screen.findByText('Se déconnecter'));

    expect(await screen.findByText('Se déconnecter de White Alpha ?')).toBeTruthy();
    expect(mockSignOut).not.toHaveBeenCalled();
  });

  it('annule la déconnexion sans appeler signOut', async () => {
    mockUseMyProfile.mockReturnValue(baseProfileState());

    await render(<ProfileScreen />);
    fireEvent.press(await screen.findByText('Se déconnecter'));
    fireEvent.press(await screen.findByText('Annuler'));

    await waitFor(() => expect(screen.queryByText('Se déconnecter de White Alpha ?')).toBeNull());
    expect(mockSignOut).not.toHaveBeenCalled();
  });

  it('confirme la déconnexion : appelle signOut', async () => {
    mockSignOut.mockResolvedValue({ error: null });
    mockUseMyProfile.mockReturnValue(baseProfileState());

    await render(<ProfileScreen />);
    fireEvent.press(await screen.findByText('Se déconnecter'));
    fireEvent.press(await screen.findByText('Confirmer'));

    await waitFor(() => expect(mockSignOut).toHaveBeenCalledTimes(1));
  });

  it('affiche une erreur française si la déconnexion échoue', async () => {
    mockSignOut.mockResolvedValue({ error: 'Impossible de se déconnecter pour le moment. Réessaie.' });
    mockUseMyProfile.mockReturnValue(baseProfileState());

    await render(<ProfileScreen />);
    fireEvent.press(await screen.findByText('Se déconnecter'));
    fireEvent.press(await screen.findByText('Confirmer'));

    await waitFor(() =>
      expect(screen.getByText('Impossible de se déconnecter pour le moment. Réessaie.')).toBeTruthy(),
    );
  });
});

import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';

import AvatarGalleryScreen from '@/app/(app)/avatar-gallery';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
}));

const baseProfile = {
  id: 'me',
  username: 'kenjiro47',
  displayName: 'Kenjiro',
  avatarUrl: null,
  avatarPath: null,
  avatarPreset: 'wolf_white_calm' as const,
  role: 'user' as const,
};

const mockUseMyProfile = jest.fn();
jest.mock('@/contexts/my-profile-context', () => ({
  useMyProfileContext: () => mockUseMyProfile(),
}));

const mockUpdateMyAvatarPreset = jest.fn();
jest.mock('@/services/profiles', () => ({
  updateMyAvatarPreset: (...args: unknown[]) => mockUpdateMyAvatarPreset(...args),
}));

const mockRemoveAvatarFile = jest.fn();
jest.mock('@/services/avatars', () => ({
  removeAvatarFile: (...args: unknown[]) => mockRemoveAvatarFile(...args),
}));

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

beforeEach(() => {
  jest.clearAllMocks();
  mockUseMyProfile.mockReturnValue(baseProfileState());
});

describe('AvatarGalleryScreen — affichage', () => {
  it("affiche l'avatar actuel en évidence dans la grille", async () => {
    await render(<AvatarGalleryScreen />);

    expect(screen.getByLabelText('Loup blanc calme (avatar actuel) (sélectionné)')).toBeTruthy();
  });

  it('affiche les 9 loups de la galerie', async () => {
    await render(<AvatarGalleryScreen />);

    for (const label of [
      'Loup blanc calme',
      'Loup gris',
      'Loup noir',
      'Loup brun',
      'Loup des neiges',
      'Loup au regard vert',
      'Loup jeune',
      'Loup protecteur',
      'Loup alpha',
    ]) {
      expect(screen.getAllByText(label).length).toBeGreaterThanOrEqual(1);
    }
  });

  it('ne contient aucune référence visible à Claude', async () => {
    await render(<AvatarGalleryScreen />);

    expect(screen.queryByText(/claude/i)).toBeNull();
  });

  it("chaque tuile de la galerie est accessible (rôle bouton, libellé)", async () => {
    await render(<AvatarGalleryScreen />);

    expect(screen.getByLabelText(/Loup gris/).props.accessibilityRole).toBe('button');
  });

  it("l'avatar sélectionné est identifiable par un repère visuel autre que la couleur (coche)", async () => {
    await render(<AvatarGalleryScreen />);

    // Un seul « ✓ » visible : sur la tuile actuellement sélectionnée
    // (l'avatar actuel par défaut) — indépendant de la couleur de la
    // bordure, pour rester identifiable en niveaux de gris/daltonisme.
    expect(screen.getAllByText('✓')).toHaveLength(1);
  });
});

describe('AvatarGalleryScreen — sélection et aperçu', () => {
  it('sélectionner un autre loup met à jour l’aperçu en grand', async () => {
    await render(<AvatarGalleryScreen />);

    await act(async () => {
      fireEvent.press(screen.getByLabelText('Loup gris'));
      await Promise.resolve();
    });

    expect(screen.getAllByText('Loup gris').length).toBeGreaterThanOrEqual(2);
  });

  it('le bouton « Choisir cet avatar » est désactivé tant que rien n’a changé', async () => {
    await render(<AvatarGalleryScreen />);

    expect(screen.getByLabelText('Choisir cet avatar').props.accessibilityState).toEqual(
      expect.objectContaining({ disabled: true }),
    );
  });

  it('Annuler revient à l’avatar déjà enregistré sans appeler la RPC', async () => {
    await render(<AvatarGalleryScreen />);

    await act(async () => {
      fireEvent.press(screen.getByLabelText('Loup gris'));
      await Promise.resolve();
    });
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Annuler'));
      await Promise.resolve();
    });

    expect(screen.getByLabelText('Loup blanc calme (avatar actuel) (sélectionné)')).toBeTruthy();
    expect(mockUpdateMyAvatarPreset).not.toHaveBeenCalled();
  });
});

describe('AvatarGalleryScreen — sauvegarde', () => {
  it('sauvegarde réussie : appelle la RPC et affiche un message de succès', async () => {
    mockUpdateMyAvatarPreset.mockResolvedValue({ avatarPreset: 'wolf_grey', previousAvatarPath: null });
    await render(<AvatarGalleryScreen />);

    await act(async () => {
      fireEvent.press(screen.getByLabelText('Loup gris'));
      await Promise.resolve();
    });
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Choisir cet avatar'));
      await Promise.resolve();
    });

    expect(mockUpdateMyAvatarPreset).toHaveBeenCalledWith('wolf_grey');
    expect(await screen.findByText('Avatar mis à jour.')).toBeTruthy();
  });

  // Correctif A6 (build 21) : un succès silencieux (aucune navigation, texte
  // discret facilement manqué) avait été signalé « rien ne se passe » lors
  // d'un test réel — alors que l'avatar était en fait bien enregistré. Le
  // retour automatique à l'écran précédent rend le succès sans ambiguïté.
  it('sauvegarde réussie : revient automatiquement à l’écran précédent (router.back)', async () => {
    mockUpdateMyAvatarPreset.mockResolvedValue({ avatarPreset: 'wolf_grey', previousAvatarPath: null });
    await render(<AvatarGalleryScreen />);

    await act(async () => {
      fireEvent.press(screen.getByLabelText('Loup gris'));
      await Promise.resolve();
    });
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Choisir cet avatar'));
      await Promise.resolve();
    });

    expect(router.back).toHaveBeenCalledTimes(1);
  });

  it('sauvegarde réussie alors qu’une photo personnelle était active : le préréglage la remplace (avatarUrl effacé, ancien fichier nettoyé)', async () => {
    mockUpdateMyAvatarPreset.mockResolvedValue({ avatarPreset: 'wolf_grey', previousAvatarPath: 'me/old-photo.jpg' });
    const setProfile = jest.fn();
    mockUseMyProfile.mockReturnValue(
      baseProfileState({
        profile: { ...baseProfile, avatarUrl: 'https://cdn.test/avatars/me/old-photo.jpg', avatarPath: 'me/old-photo.jpg' },
        setProfile,
      }),
    );
    await render(<AvatarGalleryScreen />);

    await act(async () => {
      fireEvent.press(screen.getByLabelText('Loup gris'));
      await Promise.resolve();
    });
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Choisir cet avatar'));
      await Promise.resolve();
    });

    expect(setProfile).toHaveBeenCalledWith(
      expect.objectContaining({ avatarPreset: 'wolf_grey', avatarUrl: null, avatarPath: null }),
    );
    expect(mockRemoveAvatarFile).toHaveBeenCalledWith('me/old-photo.jpg');
  });

  it("sauvegarde échouée : affiche l'erreur française dans un conteneur visible (Card), l'ancien avatar reste affiché, aucune navigation", async () => {
    mockUpdateMyAvatarPreset.mockRejectedValue(new Error("Impossible de mettre à jour l'avatar pour le moment."));
    const setProfile = jest.fn();
    mockUseMyProfile.mockReturnValue(baseProfileState({ setProfile }));
    await render(<AvatarGalleryScreen />);

    await act(async () => {
      fireEvent.press(screen.getByLabelText('Loup gris'));
      await Promise.resolve();
    });
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Choisir cet avatar'));
      await Promise.resolve();
    });

    const errorText = await screen.findByText("Impossible de mettre à jour l'avatar pour le moment.");
    expect(errorText).toBeTruthy();
    // Correctif A6 : l'erreur est portée par un conteneur (Card) avec le
    // rôle d'alerte d'accessibilité, jamais un texte nu facile à manquer.
    expect(errorText.parent?.props.accessibilityRole).toBe('alert');
    // L'ancien avatar reste affiché ailleurs dans l'app : setProfile (qui
    // propagerait le changement) n'est jamais appelé après un échec.
    expect(setProfile).not.toHaveBeenCalled();
    // Aucun écran bloqué : on reste sur cet écran, possibilité de réessayer.
    expect(router.back).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Choisir cet avatar')).toBeTruthy();
  });

  it('bouton Retour ramène au profil sans aucune modification (pas d’appel RPC)', async () => {
    await render(<AvatarGalleryScreen />);
    fireEvent.press(screen.getByText('Retour'));

    expect(router.back).toHaveBeenCalledTimes(1);
    expect(mockUpdateMyAvatarPreset).not.toHaveBeenCalled();
  });
});

describe('AvatarGalleryScreen — états chargement/erreur', () => {
  it('affiche un état de chargement pendant la récupération du profil', async () => {
    mockUseMyProfile.mockReturnValue(baseProfileState({ profile: null, isLoading: true }));

    await render(<AvatarGalleryScreen />);

    expect(screen.queryByText('Loup gris')).toBeNull();
  });

  it("affiche une erreur française avec un bouton Réessayer qui relance refresh", async () => {
    const refresh = jest.fn();
    mockUseMyProfile.mockReturnValue(
      baseProfileState({ profile: null, error: 'Impossible de charger le profil pour le moment.', refresh }),
    );

    await render(<AvatarGalleryScreen />);
    fireEvent.press(screen.getByText('Réessayer'));

    expect(refresh).toHaveBeenCalledTimes(1);
  });
});

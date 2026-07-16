import { fireEvent, render, screen } from '@testing-library/react-native';

import ConversationsScreen from '@/app/(app)/index';
import { router } from 'expo-router';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
}));

const mockUseMyProfile = jest.fn();
jest.mock('@/hooks/use-my-profile', () => ({
  useMyProfile: () => mockUseMyProfile(),
}));

const mockUseConversations = jest.fn();
jest.mock('@/hooks/use-conversations', () => ({
  useConversations: () => mockUseConversations(),
}));

function baseMyProfileState(overrides: Partial<ReturnType<typeof mockUseMyProfile>> = {}) {
  return {
    profile: null,
    isLoading: true,
    error: null,
    refresh: jest.fn(),
    setProfile: jest.fn(),
    ...overrides,
  };
}

describe('ConversationsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseMyProfile.mockReturnValue(baseMyProfileState());
  });

  it("affiche l'état vide quand l'utilisateur n'a aucune conversation", async () => {
    mockUseConversations.mockReturnValue({
      conversations: [],
      isLoading: false,
      isRefreshing: false,
      error: null,
      refresh: jest.fn(),
    });

    await render(<ConversationsScreen />);

    expect(screen.getByText('Aucune conversation')).toBeTruthy();
    expect(screen.getByText('Recherchez un utilisateur pour commencer à discuter.')).toBeTruthy();
  });

  it('affiche un état de chargement pendant la première récupération', async () => {
    mockUseConversations.mockReturnValue({
      conversations: [],
      isLoading: true,
      isRefreshing: false,
      error: null,
      refresh: jest.fn(),
    });

    await render(<ConversationsScreen />);

    expect(screen.queryByText('Aucune conversation')).toBeNull();
  });

  it("affiche un message d'erreur en français quand le chargement échoue", async () => {
    mockUseConversations.mockReturnValue({
      conversations: [],
      isLoading: false,
      isRefreshing: false,
      error: 'Impossible de charger les conversations pour le moment.',
      refresh: jest.fn(),
    });

    await render(<ConversationsScreen />);

    expect(screen.getByText('Impossible de charger les conversations pour le moment.')).toBeTruthy();
  });

  it("affiche un bouton pour ouvrir son propre profil (jamais de bouton « Déconnexion » dans cet en-tête)", async () => {
    mockUseConversations.mockReturnValue({
      conversations: [],
      isLoading: false,
      isRefreshing: false,
      error: null,
      refresh: jest.fn(),
    });

    await render(<ConversationsScreen />);

    expect(screen.getByLabelText('Ouvrir mon profil')).toBeTruthy();
    expect(screen.queryByText('Déconnexion')).toBeNull();
  });

  it("affiche l'initiale du nom affiché comme avatar tant qu'aucune photo n'est définie", async () => {
    mockUseMyProfile.mockReturnValue(
      baseMyProfileState({
        profile: { id: 'me', username: 'kenjiro47', displayName: 'Kenjiro', avatarUrl: null, avatarPath: null },
        isLoading: false,
      }),
    );
    mockUseConversations.mockReturnValue({
      conversations: [],
      isLoading: false,
      isRefreshing: false,
      error: null,
      refresh: jest.fn(),
    });

    await render(<ConversationsScreen />);

    expect(screen.getByText('K')).toBeTruthy();
  });

  it('le bouton profil navigue vers /profile au toucher', async () => {
    mockUseConversations.mockReturnValue({
      conversations: [],
      isLoading: false,
      isRefreshing: false,
      error: null,
      refresh: jest.fn(),
    });

    await render(<ConversationsScreen />);
    fireEvent.press(screen.getByLabelText('Ouvrir mon profil'));

    expect(router.push).toHaveBeenCalledWith('/profile');
  });
});

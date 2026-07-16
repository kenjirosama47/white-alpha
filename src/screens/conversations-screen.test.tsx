import { render, screen } from '@testing-library/react-native';

import ConversationsScreen from '@/app/(app)/index';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
}));

jest.mock('@/contexts/auth-context', () => ({
  useAuth: () => ({ signOut: jest.fn() }),
}));

const mockUseConversations = jest.fn();
jest.mock('@/hooks/use-conversations', () => ({
  useConversations: () => mockUseConversations(),
}));

describe('ConversationsScreen', () => {
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
});

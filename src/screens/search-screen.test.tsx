import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import SearchScreen from '@/app/(app)/search';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
}));

const mockUseUserSearch = jest.fn();
jest.mock('@/hooks/use-user-search', () => ({
  useUserSearch: () => mockUseUserSearch(),
}));

const mockGetOrCreateConversation = jest.fn();
jest.mock('@/services/conversations', () => ({
  getOrCreateConversation: (...args: unknown[]) => mockGetOrCreateConversation(...args),
}));

function baseSearchState(overrides: Partial<ReturnType<typeof mockUseUserSearch>> = {}) {
  return {
    query: '',
    setQuery: jest.fn(),
    results: [],
    isSearching: false,
    error: null,
    ...overrides,
  };
}

describe('SearchScreen', () => {
  beforeEach(() => {
    mockUseUserSearch.mockReset();
    mockGetOrCreateConversation.mockReset();
  });

  it("avant toute saisie : indication de recherche, pas de résultat vide ni d'erreur", async () => {
    mockUseUserSearch.mockReturnValue(baseSearchState({ query: '' }));

    await render(<SearchScreen />);

    expect(screen.getByText('Rechercher un utilisateur')).toBeTruthy();
    expect(screen.queryByText('Aucun utilisateur trouvé')).toBeNull();
  });

  it('affiche un état de chargement pendant la recherche', async () => {
    mockUseUserSearch.mockReturnValue(baseSearchState({ query: 'bob', isSearching: true }));

    await render(<SearchScreen />);

    expect(screen.queryByText('Rechercher un utilisateur')).toBeNull();
    expect(screen.queryByText('Aucun utilisateur trouvé')).toBeNull();
  });

  it("affiche « Aucun utilisateur trouvé » distinct de l'état vide initial", async () => {
    mockUseUserSearch.mockReturnValue(baseSearchState({ query: 'zzzzz', results: [] }));

    await render(<SearchScreen />);

    expect(screen.getByText('Aucun utilisateur trouvé')).toBeTruthy();
    expect(screen.queryByText('Rechercher un utilisateur')).toBeNull();
  });

  it("affiche une erreur française, jamais confondue avec l'état vide", async () => {
    mockUseUserSearch.mockReturnValue(
      baseSearchState({ query: 'bob', error: 'Impossible de rechercher des utilisateurs pour le moment.' }),
    );

    await render(<SearchScreen />);

    expect(screen.getByText('Impossible de rechercher des utilisateurs pour le moment.')).toBeTruthy();
    expect(screen.queryByText('Aucun utilisateur trouvé')).toBeNull();
  });

  it("l'erreur de recherche n'affiche aucun bouton Réessayer (non récupérable depuis cet état)", async () => {
    mockUseUserSearch.mockReturnValue(baseSearchState({ query: 'bob', error: 'Erreur.' }));

    await render(<SearchScreen />);

    expect(screen.queryByText('Réessayer')).toBeNull();
  });

  it('affiche les résultats trouvés', async () => {
    mockUseUserSearch.mockReturnValue(
      baseSearchState({
        query: 'bob',
        results: [{ id: 'u1', username: 'bob', displayName: 'Bob', avatarUrl: null }],
      }),
    );

    await render(<SearchScreen />);

    expect(screen.getByText('Bob')).toBeTruthy();
  });

  it('ouvre la conversation au tap sur un résultat', async () => {
    mockGetOrCreateConversation.mockResolvedValue('conv-1');
    mockUseUserSearch.mockReturnValue(
      baseSearchState({
        query: 'bob',
        results: [{ id: 'u1', username: 'bob', displayName: 'Bob', avatarUrl: null }],
      }),
    );

    await render(<SearchScreen />);
    fireEvent.press(screen.getByText('Bob'));

    await waitFor(() => expect(mockGetOrCreateConversation).toHaveBeenCalledWith('u1'));
  });

  it("affiche une erreur française si la création de conversation échoue, jamais un détail brut", async () => {
    mockGetOrCreateConversation.mockRejectedValue(new Error('Impossible de créer la conversation pour le moment.'));
    mockUseUserSearch.mockReturnValue(
      baseSearchState({
        query: 'bob',
        results: [{ id: 'u1', username: 'bob', displayName: 'Bob', avatarUrl: null }],
      }),
    );

    await render(<SearchScreen />);
    fireEvent.press(screen.getByText('Bob'));

    await waitFor(() =>
      expect(screen.getByText('Impossible de créer la conversation pour le moment.')).toBeTruthy(),
    );
  });
});

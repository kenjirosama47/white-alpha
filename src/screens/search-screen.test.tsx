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

  it("affiche « Aucun membre trouvé » distinct de l'état vide initial", async () => {
    mockUseUserSearch.mockReturnValue(baseSearchState({ query: 'zzzzz', results: [] }));

    await render(<SearchScreen />);

    expect(screen.getByText('Aucun membre trouvé')).toBeTruthy();
    expect(screen.queryByText('Rechercher un utilisateur')).toBeNull();
  });

  it("affiche une erreur française, jamais confondue avec l'état vide", async () => {
    mockUseUserSearch.mockReturnValue(
      baseSearchState({ query: 'bob', error: 'Impossible de rechercher des utilisateurs pour le moment.' }),
    );

    await render(<SearchScreen />);

    expect(screen.getByText('Impossible de rechercher des utilisateurs pour le moment.')).toBeTruthy();
    expect(screen.queryByText('Aucun membre trouvé')).toBeNull();
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

  it("n'affiche jamais l'email complet ni l'identifiant Supabase brut d'un résultat", async () => {
    mockUseUserSearch.mockReturnValue(
      baseSearchState({
        query: 'bob',
        results: [{ id: 'u1-uuid-technique', username: 'bob', displayName: 'Bob', avatarUrl: null }],
      }),
    );

    await render(<SearchScreen />);

    expect(screen.queryByText(/@.*\.(com|fr|net|org)/i)).toBeNull();
    expect(screen.queryByText('u1-uuid-technique')).toBeNull();
  });
});

describe('SearchScreen — champ de recherche', () => {
  beforeEach(() => {
    mockUseUserSearch.mockReset();
    mockGetOrCreateConversation.mockReset();
  });

  it('aucun bouton effacer tant que le champ est vide', async () => {
    mockUseUserSearch.mockReturnValue(baseSearchState({ query: '' }));

    await render(<SearchScreen />);

    expect(screen.queryByLabelText('Effacer la recherche')).toBeNull();
  });

  it('le bouton effacer vide le champ de recherche', async () => {
    const setQuery = jest.fn();
    mockUseUserSearch.mockReturnValue(baseSearchState({ query: 'bob', setQuery }));

    await render(<SearchScreen />);
    fireEvent.press(screen.getByLabelText('Effacer la recherche'));

    expect(setQuery).toHaveBeenCalledWith('');
  });

  it('le champ de recherche est accessible', async () => {
    mockUseUserSearch.mockReturnValue(baseSearchState({ query: '' }));

    await render(<SearchScreen />);

    expect(screen.getByLabelText('Rechercher un membre')).toBeTruthy();
  });
});

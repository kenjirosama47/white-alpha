import { listConversationsAction, searchMembersAction, startConversationAction } from './actions';
import { getOrCreateConversation, listMyConversations, searchMembers } from '@/lib/conversations';

jest.mock('@/lib/conversations', () => ({
  getOrCreateConversation: jest.fn(),
  listMyConversations: jest.fn(),
  searchMembers: jest.fn(),
}));

const mockSearchMembers = searchMembers as jest.Mock;
const mockGetOrCreateConversation = getOrCreateConversation as jest.Mock;
const mockListMyConversations = listMyConversations as jest.Mock;

describe('conversations actions (Phase 8.4)', () => {
  beforeEach(() => {
    mockSearchMembers.mockReset();
    mockGetOrCreateConversation.mockReset();
    mockListMyConversations.mockReset();
  });

  describe('searchMembersAction', () => {
    it('sous le minimum de caractères : liste vide, jamais d’appel à la RPC', async () => {
      const result = await searchMembersAction('a');

      expect(mockSearchMembers).not.toHaveBeenCalled();
      expect(result).toEqual({ results: [], error: null });
    });

    it('recherche valide : renvoie les résultats', async () => {
      mockSearchMembers.mockResolvedValue([{ id: 'u1', username: 'wolf1', displayName: 'Wolf One', avatarUrl: null, avatarPreset: 'wolf_grey' }]);

      const result = await searchMembersAction('wolf');

      expect(mockSearchMembers).toHaveBeenCalledWith('wolf');
      expect(result.results).toHaveLength(1);
      expect(result.error).toBeNull();
    });

    it('aucun email exposé dans les résultats (structurellement absent du type)', async () => {
      mockSearchMembers.mockResolvedValue([{ id: 'u1', username: 'wolf1', displayName: 'Wolf One', avatarUrl: null, avatarPreset: 'wolf_grey' }]);

      const result = await searchMembersAction('wolf');

      expect(JSON.stringify(result)).not.toContain('email');
    });

    it('erreur : message générique renvoyé, résultats vides', async () => {
      mockSearchMembers.mockRejectedValue(new Error('Impossible de rechercher pour le moment.'));

      const result = await searchMembersAction('wolf');

      expect(result).toEqual({ results: [], error: 'Impossible de rechercher pour le moment.' });
    });
  });

  describe('startConversationAction', () => {
    it('membre autorisé : renvoie conversationId, jamais de redirect() interne', async () => {
      mockGetOrCreateConversation.mockResolvedValue('conv-1');

      const result = await startConversationAction('target-user');

      expect(mockGetOrCreateConversation).toHaveBeenCalledWith('target-user');
      expect(result).toEqual({ conversationId: 'conv-1' });
    });

    it('échec : renvoie une erreur, jamais une exception non gérée', async () => {
      mockGetOrCreateConversation.mockRejectedValue(new Error('Utilisateur introuvable.'));

      const result = await startConversationAction('unknown-user');

      expect(result).toEqual({ error: 'Utilisateur introuvable.' });
    });
  });

  describe('listConversationsAction', () => {
    it('succès : renvoie la liste', async () => {
      mockListMyConversations.mockResolvedValue([]);

      const result = await listConversationsAction();

      expect(result).toEqual({ conversations: [] });
    });

    it('erreur : renvoie un message générique', async () => {
      mockListMyConversations.mockRejectedValue(new Error('Impossible de charger les conversations pour le moment.'));

      const result = await listConversationsAction();

      expect(result).toEqual({ error: 'Impossible de charger les conversations pour le moment.' });
    });
  });
});

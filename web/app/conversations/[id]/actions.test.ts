import { getRealtimeCredentialsAction, sendMessageAction } from './actions';
import { sendTextMessage } from '@/lib/conversations';
import { createClient } from '@/lib/supabase/server';

jest.mock('@/lib/conversations', () => ({
  sendTextMessage: jest.fn(),
}));
jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(),
}));

const mockSendTextMessage = sendTextMessage as jest.Mock;
const mockCreateClient = createClient as jest.Mock;

describe('conversation [id] actions (Phase 8.4)', () => {
  beforeEach(() => {
    mockSendTextMessage.mockReset();
    mockCreateClient.mockReset();
  });

  describe('sendMessageAction', () => {
    it('message vide refusé, jamais d’appel serveur', async () => {
      const result = await sendMessageAction('c1', '   ');

      expect(mockSendTextMessage).not.toHaveBeenCalled();
      expect(result).toEqual({ error: 'Le message ne peut pas être vide.' });
    });

    it('message trop long refusé, jamais d’appel serveur', async () => {
      const result = await sendMessageAction('c1', 'a'.repeat(4001));

      expect(mockSendTextMessage).not.toHaveBeenCalled();
      expect('error' in result).toBe(true);
    });

    it('envoi réussi : texte normalisé (trim) transmis, message renvoyé', async () => {
      mockSendTextMessage.mockResolvedValue({
        id: 'm1',
        conversationId: 'c1',
        senderId: 'u1',
        content: 'Salut',
        messageType: 'text',
        createdAt: '2026-01-01T00:00:00Z',
      });

      const result = await sendMessageAction('c1', '  Salut  ');

      expect(mockSendTextMessage).toHaveBeenCalledWith('c1', 'Salut');
      expect('message' in result && result.message.content).toBe('Salut');
    });

    it('erreur serveur : message générique renvoyé, jamais journalisé le contenu', async () => {
      mockSendTextMessage.mockRejectedValue(new Error('Conversation introuvable.'));

      const result = await sendMessageAction('c1', 'Salut');

      expect(result).toEqual({ error: 'Conversation introuvable.' });
    });
  });

  describe('getRealtimeCredentialsAction', () => {
    it('session valide : renvoie les jetons', async () => {
      mockCreateClient.mockResolvedValue({
        auth: {
          getSession: jest.fn().mockResolvedValue({
            data: { session: { access_token: 'access-token', refresh_token: 'refresh-token' } },
            error: null,
          }),
        },
      });

      const result = await getRealtimeCredentialsAction();

      expect(result).toEqual({ accessToken: 'access-token', refreshToken: 'refresh-token' });
    });

    it('aucune session : renvoie null, jamais une exception', async () => {
      mockCreateClient.mockResolvedValue({
        auth: { getSession: jest.fn().mockResolvedValue({ data: { session: null }, error: null }) },
      });

      const result = await getRealtimeCredentialsAction();

      expect(result).toBeNull();
    });

    it('erreur Supabase : renvoie null, jamais le détail brut', async () => {
      mockCreateClient.mockResolvedValue({
        auth: { getSession: jest.fn().mockResolvedValue({ data: { session: null }, error: { message: 'boom' } }) },
      });

      const result = await getRealtimeCredentialsAction();

      expect(result).toBeNull();
    });
  });
});

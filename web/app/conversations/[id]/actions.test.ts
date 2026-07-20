import { fetchMessageByIdAction, getRealtimeCredentialsAction, getSignedAttachmentUrlAction, sendMessageAction } from './actions';
import { fetchMessageById, sendTextMessage } from '@/lib/conversations';
import { createClient } from '@/lib/supabase/server';

jest.mock('@/lib/conversations', () => ({
  sendTextMessage: jest.fn(),
  fetchMessageById: jest.fn(),
}));
jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(),
}));

const mockSendTextMessage = sendTextMessage as jest.Mock;
const mockFetchMessageById = fetchMessageById as jest.Mock;
const mockCreateClient = createClient as jest.Mock;

describe('conversation [id] actions (Phase 8.4/8.5.4)', () => {
  beforeEach(() => {
    mockSendTextMessage.mockReset();
    mockFetchMessageById.mockReset();
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

  describe('fetchMessageByIdAction (Phase 8.5.4)', () => {
    it('délègue à fetchMessageById (Realtime : message média rechargé avec sa pièce jointe)', async () => {
      mockFetchMessageById.mockResolvedValue({
        id: 'm1',
        conversationId: 'c1',
        senderId: 'u1',
        content: '',
        messageType: 'image',
        createdAt: '2026-01-01T00:00:00Z',
        attachment: { id: 'a1', mediaType: 'image', mimeType: 'image/jpeg', width: 800, height: 600, durationMs: null },
      });

      const result = await fetchMessageByIdAction('m1');

      expect(mockFetchMessageById).toHaveBeenCalledWith('m1');
      expect(result?.attachment?.id).toBe('a1');
    });

    it('échec (message inexistant, accès refusé, erreur réseau) : renvoie null, jamais une exception propagée', async () => {
      mockFetchMessageById.mockRejectedValue(new Error('boom'));

      const result = await fetchMessageByIdAction('m-not-mine');

      expect(result).toBeNull();
    });
  });

  describe('getSignedAttachmentUrlAction (Phase 8.5.4)', () => {
    function mockClient(options: {
      attachmentRow?: { storage_path: string } | null;
      signedUrl?: string | null;
      signError?: { message: string } | null;
    }) {
      const { attachmentRow = null, signedUrl = null, signError = null } = options;
      const maybeSingle = jest.fn().mockResolvedValue({ data: attachmentRow });
      const eq = jest.fn().mockReturnValue({ maybeSingle });
      const select = jest.fn().mockReturnValue({ eq });
      const from = jest.fn().mockReturnValue({ select });
      const createSignedUrl = jest.fn().mockResolvedValue({ data: signedUrl ? { signedUrl } : null, error: signError });
      const storageFrom = jest.fn().mockReturnValue({ createSignedUrl });
      return { from, storage: { from: storageFrom }, __mocks: { maybeSingle, eq, select, from, createSignedUrl, storageFrom } };
    }

    it('entrée : uniquement attachmentId — résout le chemin côté serveur, jamais reçu du client', async () => {
      const client = mockClient({ attachmentRow: { storage_path: 'c1/u1/secret-uuid.jpg' }, signedUrl: 'https://example.supabase.co/signed/xyz' });
      mockCreateClient.mockResolvedValue(client);

      const result = await getSignedAttachmentUrlAction('a1');

      expect(client.__mocks.from).toHaveBeenCalledWith('message_attachments');
      expect(client.__mocks.eq).toHaveBeenCalledWith('id', 'a1');
      expect(client.__mocks.storageFrom).toHaveBeenCalledWith('chat-media');
      expect(client.__mocks.createSignedUrl).toHaveBeenCalledWith('c1/u1/secret-uuid.jpg', 3600);
      expect(result).toBe('https://example.supabase.co/signed/xyz');
    });

    it('utilise le TTL centralisé (3600 s)', async () => {
      const client = mockClient({ attachmentRow: { storage_path: 'c1/u1/x.jpg' }, signedUrl: 'https://example.supabase.co/signed/x' });
      mockCreateClient.mockResolvedValue(client);

      await getSignedAttachmentUrlAction('a1');

      expect(client.__mocks.createSignedUrl).toHaveBeenCalledWith(expect.any(String), 3600);
    });

    it('pièce jointe inexistante ou hors des conversations de l’utilisateur (RLS) : renvoie null, jamais une erreur distinctive', async () => {
      const client = mockClient({ attachmentRow: null });
      mockCreateClient.mockResolvedValue(client);

      const result = await getSignedAttachmentUrlAction('a-not-mine');

      expect(result).toBeNull();
      expect(client.__mocks.storageFrom).not.toHaveBeenCalled();
    });

    it('échec Supabase Storage (createSignedUrl) : renvoie null, jamais le détail brut', async () => {
      const client = mockClient({ attachmentRow: { storage_path: 'c1/u1/x.jpg' }, signError: { message: 'détail interne Supabase' } });
      mockCreateClient.mockResolvedValue(client);

      const result = await getSignedAttachmentUrlAction('a1');

      expect(result).toBeNull();
    });

    it('la réponse ne contient jamais storagePath brut (seule l’URL signée est renvoyée)', async () => {
      const client = mockClient({ attachmentRow: { storage_path: 'c1/u1/secret-uuid.jpg' }, signedUrl: 'https://example.supabase.co/signed/opaque-token' });
      mockCreateClient.mockResolvedValue(client);

      const result = await getSignedAttachmentUrlAction('a1');

      expect(result).not.toContain('c1/u1/secret-uuid.jpg');
    });
  });
});

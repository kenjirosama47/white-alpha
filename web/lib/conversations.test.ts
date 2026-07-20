import {
  fetchMessageById,
  fetchMessagesPage,
  getConversationHeader,
  getOrCreateConversation,
  listMyConversations,
  searchMembers,
  sendTextMessage,
} from './conversations';
import { createClient } from './supabase/server';

jest.mock('./supabase/server', () => ({
  createClient: jest.fn(),
}));
jest.mock('./supabase/config', () => ({
  SUPABASE_URL: 'https://example.supabase.co',
}));

const mockCreateClient = createClient as jest.Mock;

function makeSupabaseMock(rpcResult: { data: unknown; error: unknown }) {
  const rpc = jest.fn().mockResolvedValue(rpcResult);
  return { rpc };
}

describe('lib/conversations (Phase 8.4, couche de données serveur)', () => {
  beforeEach(() => {
    mockCreateClient.mockReset();
  });

  describe('listMyConversations', () => {
    it('mappe la RPC list_my_conversations, résout avatar_url en URL publique', async () => {
      const { rpc } = makeSupabaseMock({
        data: [
          {
            conversation_id: 'c1',
            other_user_id: 'u1',
            other_username: 'wolf1',
            other_display_name: 'Wolf One',
            other_avatar_url: 'u1/photo.jpg',
            other_avatar_preset: 'wolf_alpha',
            last_message_content: 'Salut',
            last_message_created_at: '2026-01-01T00:00:00Z',
          },
        ],
        error: null,
      });
      mockCreateClient.mockResolvedValue({ rpc });

      const result = await listMyConversations();

      expect(rpc).toHaveBeenCalledWith('list_my_conversations');
      expect(result).toEqual([
        {
          conversationId: 'c1',
          otherParticipant: {
            id: 'u1',
            username: 'wolf1',
            displayName: 'Wolf One',
            avatarUrl: 'https://example.supabase.co/storage/v1/object/public/avatars/u1/photo.jpg',
            avatarPreset: 'wolf_alpha',
          },
          lastMessageContent: 'Salut',
          lastMessageCreatedAt: '2026-01-01T00:00:00Z',
        },
      ]);
    });

    it('erreur RPC : message générique, jamais le détail brut sauf exception contrôlée (P0001)', async () => {
      const { rpc } = makeSupabaseMock({ data: null, error: { code: '42501', message: 'permission denied' } });
      mockCreateClient.mockResolvedValue({ rpc });

      await expect(listMyConversations()).rejects.toThrow('Impossible de charger les conversations pour le moment.');
    });
  });

  describe('getConversationHeader', () => {
    it('zéro ligne (accès refusé ou conversation inexistante) : renvoie null, jamais une erreur distinctive', async () => {
      const { rpc } = makeSupabaseMock({ data: [], error: null });
      mockCreateClient.mockResolvedValue({ rpc });

      const result = await getConversationHeader('c-not-mine');

      expect(rpc).toHaveBeenCalledWith('get_conversation_for_notification', { p_conversation_id: 'c-not-mine' });
      expect(result).toBeNull();
    });

    it('conversation autorisée : renvoie le profil de l’autre participant', async () => {
      const { rpc } = makeSupabaseMock({
        data: [
          {
            conversation_id: 'c1',
            other_user_id: 'u1',
            other_username: 'wolf1',
            other_display_name: 'Wolf One',
            other_avatar_url: null,
            other_avatar_preset: 'wolf_grey',
          },
        ],
        error: null,
      });
      mockCreateClient.mockResolvedValue({ rpc });

      const result = await getConversationHeader('c1');

      expect(result).toEqual({
        conversationId: 'c1',
        id: 'u1',
        username: 'wolf1',
        displayName: 'Wolf One',
        avatarUrl: null,
        avatarPreset: 'wolf_grey',
      });
    });
  });

  describe('searchMembers', () => {
    it('mappe les résultats sans jamais exposer email ni rôle (colonnes absentes de la RPC)', async () => {
      const { rpc } = makeSupabaseMock({
        data: [{ id: 'u2', username: 'wolf2', display_name: 'Wolf Two', avatar_url: null, avatar_preset: 'wolf_snow' }],
        error: null,
      });
      mockCreateClient.mockResolvedValue({ rpc });

      const result = await searchMembers('wolf');

      expect(rpc).toHaveBeenCalledWith('search_public_profiles', { search_query: 'wolf' });
      expect(result).toEqual([{ id: 'u2', username: 'wolf2', displayName: 'Wolf Two', avatarUrl: null, avatarPreset: 'wolf_snow' }]);
      expect(Object.keys(result[0]!)).not.toContain('email');
    });
  });

  describe('getOrCreateConversation', () => {
    it('appelle get_or_create_direct_conversation et renvoie l’id', async () => {
      const { rpc } = makeSupabaseMock({ data: 'conv-123', error: null });
      mockCreateClient.mockResolvedValue({ rpc });

      const result = await getOrCreateConversation('target-user');

      expect(rpc).toHaveBeenCalledWith('get_or_create_direct_conversation', { target_user_id: 'target-user' });
      expect(result).toBe('conv-123');
    });
  });

  describe('sendTextMessage', () => {
    it('appelle create_text_message, jamais un INSERT direct', async () => {
      const { rpc } = makeSupabaseMock({
        data: [{ message_id: 'm1', conversation_id: 'c1', sender_id: 'u1', content: 'Salut', created_at: '2026-01-01T00:00:00Z' }],
        error: null,
      });
      mockCreateClient.mockResolvedValue({ rpc });

      const result = await sendTextMessage('c1', 'Salut');

      expect(rpc).toHaveBeenCalledWith('create_text_message', { p_conversation_id: 'c1', p_content: 'Salut' });
      expect(result).toEqual({
        id: 'm1',
        conversationId: 'c1',
        senderId: 'u1',
        content: 'Salut',
        messageType: 'text',
        createdAt: '2026-01-01T00:00:00Z',
        attachment: null,
      });
    });
  });

  describe('fetchMessagesPage', () => {
    it('sélectionne directement sur messages (RLS), filtre par conversation, ordre chronologique en sortie', async () => {
      const query = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue({
          data: [
            { id: 'm2', conversation_id: 'c1', sender_id: 'u1', content: 'Deux', message_type: 'text', created_at: '2026-01-01T00:02:00Z', message_attachments: null },
            { id: 'm1', conversation_id: 'c1', sender_id: 'u1', content: 'Un', message_type: 'text', created_at: '2026-01-01T00:01:00Z', message_attachments: null },
          ],
          error: null,
        }),
      };
      const from = jest.fn().mockReturnValue(query);
      mockCreateClient.mockResolvedValue({ from });

      const result = await fetchMessagesPage('c1');

      expect(from).toHaveBeenCalledWith('messages');
      expect(query.eq).toHaveBeenCalledWith('conversation_id', 'c1');
      expect(result.map((m) => m.id)).toEqual(['m1', 'm2']);
    });

    it('sélectionne la jointure message_attachments, jamais storage_path (colonne absente de la sélection)', async () => {
      const query = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue({ data: [], error: null }),
      };
      const from = jest.fn().mockReturnValue(query);
      mockCreateClient.mockResolvedValue({ from });

      await fetchMessagesPage('c1');

      const selectArg = query.select.mock.calls[0]?.[0] as string;
      expect(selectArg).toContain('message_attachments(');
      expect(selectArg).not.toContain('storage_path');
    });

    it('mappe une pièce jointe image : media_type/mime_type/dimensions, jamais storagePath', async () => {
      const query = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue({
          data: [
            {
              id: 'm1',
              conversation_id: 'c1',
              sender_id: 'u1',
              content: '',
              message_type: 'image',
              created_at: '2026-01-01T00:00:00Z',
              message_attachments: [{ id: 'a1', media_type: 'image', mime_type: 'image/jpeg', width: 800, height: 600, duration_ms: null }],
            },
          ],
          error: null,
        }),
      };
      const from = jest.fn().mockReturnValue(query);
      mockCreateClient.mockResolvedValue({ from });

      const result = await fetchMessagesPage('c1');

      expect(result[0]?.attachment).toEqual({ id: 'a1', mediaType: 'image', mimeType: 'image/jpeg', width: 800, height: 600, durationMs: null });
      expect(JSON.stringify(result[0])).not.toContain('storage_path');
    });
  });

  describe('fetchMessageById', () => {
    it('renvoie le message avec sa pièce jointe (utilisé après un INSERT Realtime média)', async () => {
      const query = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({
          data: {
            id: 'm1',
            conversation_id: 'c1',
            sender_id: 'u1',
            content: '',
            message_type: 'video',
            created_at: '2026-01-01T00:00:00Z',
            message_attachments: [{ id: 'a1', media_type: 'video', mime_type: 'video/mp4', width: 640, height: 480, duration_ms: 5000 }],
          },
          error: null,
        }),
      };
      const from = jest.fn().mockReturnValue(query);
      mockCreateClient.mockResolvedValue({ from });

      const result = await fetchMessageById('m1');

      expect(from).toHaveBeenCalledWith('messages');
      expect(query.eq).toHaveBeenCalledWith('id', 'm1');
      expect(result?.attachment).toEqual({ id: 'a1', mediaType: 'video', mimeType: 'video/mp4', width: 640, height: 480, durationMs: 5000 });
    });

    it('message inexistant ou hors des conversations de l’utilisateur (RLS) : renvoie null, jamais une erreur distinctive', async () => {
      const query = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
      };
      const from = jest.fn().mockReturnValue(query);
      mockCreateClient.mockResolvedValue({ from });

      const result = await fetchMessageById('m-not-mine');

      expect(result).toBeNull();
    });
  });
});

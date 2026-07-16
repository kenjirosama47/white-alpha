import { supabase } from '@/lib/supabase';
import { getOrCreateConversation, listConversations } from '@/services/conversations';

jest.mock('@/lib/supabase', () => ({
  supabase: { rpc: jest.fn() },
}));

const mockRpc = supabase.rpc as jest.Mock;

describe('getOrCreateConversation', () => {
  beforeEach(() => {
    mockRpc.mockReset();
  });

  it('crée ou réutilise une conversation et retourne son id', async () => {
    mockRpc.mockResolvedValue({ data: 'conv-123', error: null });

    const id = await getOrCreateConversation('user-b');

    expect(mockRpc).toHaveBeenCalledWith('get_or_create_direct_conversation', {
      target_user_id: 'user-b',
    });
    expect(id).toBe('conv-123');
  });

  it("remonte le message d'une exception volontaire de la RPC (SQLSTATE P0001) quand la création est refusée", async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { code: 'P0001', message: 'Impossible de créer une conversation avec soi-même.' },
    });

    await expect(getOrCreateConversation('self')).rejects.toThrow('soi-même');
  });

  it("ne laisse jamais fuir un message technique brut (pas de SQLSTATE P0001) : message français générique à la place", async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'Network error' } });

    await expect(getOrCreateConversation('user-b')).rejects.toThrow(
      'Impossible de créer la conversation pour le moment.',
    );
  });
});

describe('listConversations', () => {
  beforeEach(() => {
    mockRpc.mockReset();
  });

  it('mappe les lignes retournées par la RPC list_my_conversations', async () => {
    mockRpc.mockResolvedValue({
      data: [
        {
          conversation_id: 'c1',
          other_user_id: 'u2',
          other_username: 'bob',
          other_display_name: 'Bob',
          other_avatar_url: null,
          last_message_content: 'Salut',
          last_message_created_at: '2026-07-15T10:00:00Z',
        },
      ],
      error: null,
    });

    const result = await listConversations();

    expect(result).toEqual([
      {
        conversationId: 'c1',
        otherParticipant: { id: 'u2', username: 'bob', displayName: 'Bob', avatarUrl: null },
        lastMessageContent: 'Salut',
        lastMessageCreatedAt: '2026-07-15T10:00:00Z',
      },
    ]);
  });

  it('retourne une liste vide quand data est null', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });

    const result = await listConversations();

    expect(result).toEqual([]);
  });
});

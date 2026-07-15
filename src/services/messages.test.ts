import { supabase } from '@/lib/supabase';
import { fetchMessages, sendMessage } from '@/services/messages';
import { MESSAGE_MAX_LENGTH } from '@/types/chat';

jest.mock('@/lib/supabase', () => ({
  supabase: { from: jest.fn() },
}));

const mockFrom = supabase.from as jest.Mock;

describe('sendMessage', () => {
  beforeEach(() => {
    mockFrom.mockReset();
  });

  it('rejette un message vide sans interroger la base', async () => {
    await expect(sendMessage('conv-1', 'user-1', '   ')).rejects.toThrow('vide');
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('rejette un message de plus de 4000 caractères sans interroger la base', async () => {
    const tooLong = 'a'.repeat(MESSAGE_MAX_LENGTH + 1);
    await expect(sendMessage('conv-1', 'user-1', tooLong)).rejects.toThrow('4000');
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('insère un message valide et retourne la ligne mappée', async () => {
    const single = jest.fn().mockResolvedValue({
      data: {
        id: 'm1',
        conversation_id: 'conv-1',
        sender_id: 'user-1',
        content: 'Salut',
        created_at: '2026-07-15T10:00:00Z',
      },
      error: null,
    });
    const select = jest.fn().mockReturnValue({ single });
    const insert = jest.fn().mockReturnValue({ select });
    mockFrom.mockReturnValue({ insert });

    const result = await sendMessage('conv-1', 'user-1', 'Salut');

    expect(insert).toHaveBeenCalledWith({ conversation_id: 'conv-1', sender_id: 'user-1', content: 'Salut' });
    expect(result).toEqual({
      id: 'm1',
      conversationId: 'conv-1',
      senderId: 'user-1',
      content: 'Salut',
      createdAt: '2026-07-15T10:00:00Z',
    });
  });
});

describe('fetchMessages', () => {
  beforeEach(() => {
    mockFrom.mockReset();
  });

  it("remonte une erreur réseau sous forme d'exception", async () => {
    const limit = jest.fn().mockResolvedValue({ data: null, error: { message: 'network down' } });
    const order = jest.fn().mockReturnValue({ limit });
    const eq = jest.fn().mockReturnValue({ order });
    const select = jest.fn().mockReturnValue({ eq });
    mockFrom.mockReturnValue({ select });

    await expect(fetchMessages('conv-1')).rejects.toThrow('Impossible de charger les messages');
  });
});

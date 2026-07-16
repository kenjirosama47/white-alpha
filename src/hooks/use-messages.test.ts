import { act, renderHook, waitFor } from '@testing-library/react-native';

import { useMessages } from '@/hooks/use-messages';
import { fetchMessages, sendMessage } from '@/services/messages';
import { supabase } from '@/lib/supabase';
import type { Message } from '@/types/chat';

jest.mock('@/contexts/auth-context', () => ({
  useAuth: () => ({ session: { user: { id: 'user-1' } } }),
}));

jest.mock('@/services/messages', () => ({
  MESSAGES_PAGE_SIZE: 30,
  fetchMessages: jest.fn(),
  fetchMessageById: jest.fn(),
  sendMessage: jest.fn(),
}));

const mockChannel = {
  on: jest.fn().mockReturnThis(),
  subscribe: jest.fn().mockReturnThis(),
};

jest.mock('@/lib/supabase', () => ({
  supabase: {
    channel: jest.fn(() => mockChannel),
    removeChannel: jest.fn(),
  },
}));

describe('useMessages', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (fetchMessages as jest.Mock).mockResolvedValue([]);
  });

  it("protège contre le double envoi tant qu'un message est déjà en cours d'envoi", async () => {
    let resolveSend: (value: unknown) => void = () => {};
    (sendMessage as jest.Mock).mockReturnValue(
      new Promise((resolve) => {
        resolveSend = resolve;
      }),
    );

    const { result } = await renderHook(() => useMessages('conv-1'));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const firstSend = result.current.send('Salut');
    // Un second envoi pendant que le premier est encore en vol doit être ignoré.
    result.current.send('Salut encore');

    expect(sendMessage).toHaveBeenCalledTimes(1);

    resolveSend({
      id: 'm1',
      conversation_id: 'conv-1',
      sender_id: 'user-1',
      content: 'Salut',
      created_at: '2026-07-15T10:00:00Z',
    });
    await firstSend;
  });

  it('se réabonne au channel realtime filtré par conversation_id et le nettoie au démontage', async () => {
    const { unmount } = await renderHook(() => useMessages('conv-1'));

    await waitFor(() => expect(supabase.channel).toHaveBeenCalledWith('messages:conversation:conv-1'));
    expect(mockChannel.on).toHaveBeenCalledWith(
      'postgres_changes',
      expect.objectContaining({ filter: 'conversation_id=eq.conv-1' }),
      expect.any(Function),
    );

    await unmount();

    expect(supabase.removeChannel).toHaveBeenCalledTimes(1);
  });

  it("s'abonne aussi à un événement DELETE filtré par conversation_id", async () => {
    await renderHook(() => useMessages('conv-1'));

    await waitFor(() => expect(supabase.channel).toHaveBeenCalledWith('messages:conversation:conv-1'));
    expect(mockChannel.on).toHaveBeenCalledWith(
      'postgres_changes',
      expect.objectContaining({ event: 'DELETE', filter: 'conversation_id=eq.conv-1' }),
      expect.any(Function),
    );
  });

  it('retire un message localement quand un événement DELETE realtime arrive', async () => {
    const existing: Message = {
      id: 'm1',
      conversationId: 'conv-1',
      senderId: 'user-2',
      content: 'Salut',
      createdAt: '2026-07-15T10:00:00Z',
      attachment: null,
    };
    (fetchMessages as jest.Mock).mockResolvedValue([existing]);

    const { result } = await renderHook(() => useMessages('conv-1'));
    await waitFor(() => expect(result.current.messages).toHaveLength(1));

    const deleteCall = (mockChannel.on as jest.Mock).mock.calls.find(
      ([, config]) => config.event === 'DELETE',
    );
    expect(deleteCall).toBeDefined();
    const deleteHandler = deleteCall![2] as (payload: unknown) => void;

    await act(async () => {
      // REPLICA IDENTITY FULL sur messages : payload.old contient toutes les
      // colonnes malgré la suppression, dont id.
      deleteHandler({ old: { id: 'm1', conversation_id: 'conv-1' } });
    });

    expect(result.current.messages).toHaveLength(0);
  });

  it('ignore un événement DELETE sans id exploitable dans payload.old', async () => {
    const existing: Message = {
      id: 'm1',
      conversationId: 'conv-1',
      senderId: 'user-2',
      content: 'Salut',
      createdAt: '2026-07-15T10:00:00Z',
      attachment: null,
    };
    (fetchMessages as jest.Mock).mockResolvedValue([existing]);

    const { result } = await renderHook(() => useMessages('conv-1'));
    await waitFor(() => expect(result.current.messages).toHaveLength(1));

    const deleteCall = (mockChannel.on as jest.Mock).mock.calls.find(
      ([, config]) => config.event === 'DELETE',
    );
    const deleteHandler = deleteCall![2] as (payload: unknown) => void;

    await act(async () => {
      deleteHandler({ old: null });
    });

    expect(result.current.messages).toHaveLength(1);
  });

  it('removeMessageLocally retire immédiatement le message ciblé, sans toucher les autres', async () => {
    const first: Message = {
      id: 'm1',
      conversationId: 'conv-1',
      senderId: 'user-1',
      content: 'Un',
      createdAt: '2026-07-15T10:00:00Z',
      attachment: null,
    };
    const second: Message = {
      id: 'm2',
      conversationId: 'conv-1',
      senderId: 'user-1',
      content: 'Deux',
      createdAt: '2026-07-15T10:01:00Z',
      attachment: null,
    };
    (fetchMessages as jest.Mock).mockResolvedValue([first, second]);

    const { result } = await renderHook(() => useMessages('conv-1'));
    await waitFor(() => expect(result.current.messages).toHaveLength(2));

    await act(async () => {
      result.current.removeMessageLocally('m1');
    });

    expect(result.current.messages.map((message) => message.id)).toEqual(['m2']);
  });

  it('removeMessageLocally sur le seul/dernier message de la conversation vide la liste sans erreur (Phase 5.4 : suppression vidéo)', async () => {
    const onlyVideo: Message = {
      id: 'm-video',
      conversationId: 'conv-1',
      senderId: 'user-1',
      content: '',
      createdAt: '2026-07-15T10:00:00Z',
      attachment: {
        id: 'att-1',
        messageId: 'm-video',
        conversationId: 'conv-1',
        uploaderId: 'user-1',
        mediaType: 'video',
        storagePath: 'conv-1/user-1/clip.mp4',
        mimeType: 'video/mp4',
        sizeBytes: 2_000_000,
        width: 1280,
        height: 720,
        durationMs: 15_000,
        createdAt: '2026-07-15T10:00:00Z',
      },
    };
    (fetchMessages as jest.Mock).mockResolvedValue([onlyVideo]);

    const { result } = await renderHook(() => useMessages('conv-1'));
    await waitFor(() => expect(result.current.messages).toHaveLength(1));

    await act(async () => {
      result.current.removeMessageLocally('m-video');
    });

    expect(result.current.messages).toEqual([]);
  });

  it('supprimer une vidéo parmi plusieurs ne retire que celle-ci (les autres vidéos restent intactes)', async () => {
    const makeVideo = (id: string): Message => ({
      id,
      conversationId: 'conv-1',
      senderId: 'user-1',
      content: '',
      createdAt: '2026-07-15T10:00:00Z',
      attachment: {
        id: `att-${id}`,
        messageId: id,
        conversationId: 'conv-1',
        uploaderId: 'user-1',
        mediaType: 'video',
        storagePath: `conv-1/user-1/${id}.mp4`,
        mimeType: 'video/mp4',
        sizeBytes: 2_000_000,
        width: 1280,
        height: 720,
        durationMs: 15_000,
        createdAt: '2026-07-15T10:00:00Z',
      },
    });
    const videos = [makeVideo('m-video-1'), makeVideo('m-video-2'), makeVideo('m-video-3')];
    (fetchMessages as jest.Mock).mockResolvedValue(videos);

    const { result } = await renderHook(() => useMessages('conv-1'));
    await waitFor(() => expect(result.current.messages).toHaveLength(3));

    await act(async () => {
      result.current.removeMessageLocally('m-video-2');
    });

    expect(result.current.messages.map((message) => message.id)).toEqual(['m-video-1', 'm-video-3']);
  });
});

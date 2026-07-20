import { act, renderHook } from '@testing-library/react';

import { useMessages } from './useMessages';
import { createClient } from '@/lib/supabase/client';
import { useOnlineStatus } from '@/lib/use-online-status';
import { fetchMessageByIdAction, getRealtimeCredentialsAction, sendMessageAction } from './actions';

jest.mock('@/lib/supabase/client', () => ({ createClient: jest.fn() }));
jest.mock('@/lib/use-online-status', () => ({ useOnlineStatus: jest.fn() }));
jest.mock('./actions', () => ({
  getRealtimeCredentialsAction: jest.fn(),
  sendMessageAction: jest.fn(),
  fetchMessageByIdAction: jest.fn(),
}));

const mockCreateClient = createClient as jest.Mock;
const mockUseOnlineStatus = useOnlineStatus as jest.Mock;
const mockGetRealtimeCredentialsAction = getRealtimeCredentialsAction as jest.Mock;
const mockSendMessageAction = sendMessageAction as jest.Mock;
const mockFetchMessageByIdAction = fetchMessageByIdAction as jest.Mock;

type InsertPayload = { new: Record<string, unknown> };
type DeletePayload = { old: Record<string, unknown> | null };

type FakeChannel = {
  on: jest.Mock<FakeChannel, [string, { event: string }, (payload: never) => void]>;
  subscribe: jest.Mock<FakeChannel, []>;
};

function makeFakeClient() {
  const handlers: { insert?: (payload: InsertPayload) => void; delete?: (payload: DeletePayload) => void } = {};
  const channel: FakeChannel = {
    on: jest.fn((_type: string, config: { event: string }, handler: (payload: never) => void) => {
      if (config.event === 'INSERT') handlers.insert = handler as (payload: InsertPayload) => void;
      if (config.event === 'DELETE') handlers.delete = handler as (payload: DeletePayload) => void;
      return channel;
    }),
    subscribe: jest.fn(() => channel),
  };
  const client = {
    auth: { setSession: jest.fn().mockResolvedValue({ data: {}, error: null }) },
    channel: jest.fn(() => channel),
    removeChannel: jest.fn(),
    from: jest.fn(),
  };
  return { client, channel, handlers };
}

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe('useMessages (Phase 8.4/8.5.4)', () => {
  beforeEach(() => {
    mockCreateClient.mockReset();
    mockUseOnlineStatus.mockReset().mockReturnValue(true);
    mockGetRealtimeCredentialsAction.mockReset().mockResolvedValue({ accessToken: 'access', refreshToken: 'refresh' });
    mockSendMessageAction.mockReset();
    mockFetchMessageByIdAction.mockReset();
  });

  it('réception temps réel : un message texte d’un autre participant est ajouté, canal filtré par conversation', async () => {
    const { client, handlers } = makeFakeClient();
    mockCreateClient.mockReturnValue(client);

    const { result } = renderHook(() => useMessages('c1', [], 'me'));
    await flush();

    expect(client.channel).toHaveBeenCalledWith('messages:conversation:c1');

    act(() => {
      handlers.insert?.({
        new: { id: 'm1', conversation_id: 'c1', sender_id: 'other', content: 'Salut', message_type: 'text', created_at: '2026-01-01T00:00:00Z' },
      });
    });

    expect(result.current.messages).toEqual([
      { id: 'm1', conversationId: 'c1', senderId: 'other', content: 'Salut', messageType: 'text', createdAt: '2026-01-01T00:00:00Z', attachment: null, status: 'sent' },
    ]);
    // Un message texte ne nécessite jamais de rechargement complémentaire.
    expect(mockFetchMessageByIdAction).not.toHaveBeenCalled();
  });

  it('déduplication : un message déjà reçu (sent) n’est jamais dupliqué', async () => {
    const { client, handlers } = makeFakeClient();
    mockCreateClient.mockReturnValue(client);

    const initial = [
      { id: 'm1', conversationId: 'c1', senderId: 'other', content: 'Salut', messageType: 'text' as const, createdAt: '2026-01-01T00:00:00Z', attachment: null },
    ];
    const { result } = renderHook(() => useMessages('c1', initial, 'me'));
    await flush();

    act(() => {
      handlers.insert?.({
        new: { id: 'm1', conversation_id: 'c1', sender_id: 'other', content: 'Salut', message_type: 'text', created_at: '2026-01-01T00:00:00Z' },
      });
    });

    expect(result.current.messages).toHaveLength(1);
  });

  it('désabonnement au démontage', async () => {
    const { client } = makeFakeClient();
    mockCreateClient.mockReturnValue(client);

    const { unmount } = renderHook(() => useMessages('c1', [], 'me'));
    await flush();

    unmount();

    expect(client.removeChannel).toHaveBeenCalled();
  });

  it('changement de conversation : désabonnement de l’ancien canal, nouvel abonnement filtré sur la nouvelle conversation', async () => {
    const fake1 = makeFakeClient();
    const fake2 = makeFakeClient();
    mockCreateClient.mockReturnValueOnce(fake1.client).mockReturnValueOnce(fake2.client);

    const { rerender } = renderHook(({ conversationId }) => useMessages(conversationId, [], 'me'), {
      initialProps: { conversationId: 'c1' },
    });
    await flush();

    rerender({ conversationId: 'c2' });
    await flush();

    expect(fake1.client.removeChannel).toHaveBeenCalled();
    expect(fake2.client.channel).toHaveBeenCalledWith('messages:conversation:c2');
  });

  it('envoi réussi : message optimiste (pending) puis remplacé par le message serveur (sent)', async () => {
    const { client } = makeFakeClient();
    mockCreateClient.mockReturnValue(client);
    let resolveSend: (value: unknown) => void = () => {};
    mockSendMessageAction.mockReturnValue(
      new Promise((resolve) => {
        resolveSend = resolve;
      }),
    );

    const { result } = renderHook(() => useMessages('c1', [], 'me'));
    await flush();

    act(() => {
      result.current.send('Salut');
    });

    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0]?.status).toBe('pending');
    expect(result.current.isSending).toBe(true);

    await act(async () => {
      resolveSend({
        message: { id: 'm1', conversationId: 'c1', senderId: 'me', content: 'Salut', messageType: 'text', createdAt: '2026-01-01T00:00:00Z', attachment: null },
      });
      await new Promise((resolveWait) => setTimeout(resolveWait, 0));
    });

    expect(result.current.messages).toEqual([
      { id: 'm1', conversationId: 'c1', senderId: 'me', content: 'Salut', messageType: 'text', createdAt: '2026-01-01T00:00:00Z', attachment: null, status: 'sent' },
    ]);
    expect(result.current.isSending).toBe(false);
  });

  it('double envoi bloqué : le second appel avant résolution du premier est ignoré', async () => {
    const { client } = makeFakeClient();
    mockCreateClient.mockReturnValue(client);
    mockSendMessageAction.mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() => useMessages('c1', [], 'me'));
    await flush();

    act(() => {
      result.current.send('Un');
      result.current.send('Deux');
    });

    expect(mockSendMessageAction).toHaveBeenCalledTimes(1);
  });

  it('erreur d’envoi : le message est marqué failed, sendError renseigné, jamais perdu silencieusement', async () => {
    const { client } = makeFakeClient();
    mockCreateClient.mockReturnValue(client);
    mockSendMessageAction.mockResolvedValue({ error: 'Conversation introuvable.' });

    const { result } = renderHook(() => useMessages('c1', [], 'me'));
    await flush();

    await act(async () => {
      result.current.send('Salut');
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0]?.status).toBe('failed');
    expect(result.current.sendError).toBe('Conversation introuvable.');
  });

  it('réessai : renvoie le même contenu avec le même identifiant temporaire, remplacé par le message serveur en cas de succès', async () => {
    const { client } = makeFakeClient();
    mockCreateClient.mockReturnValue(client);
    mockSendMessageAction.mockResolvedValueOnce({ error: 'Erreur réseau.' });

    const { result } = renderHook(() => useMessages('c1', [], 'me'));
    await flush();

    await act(async () => {
      result.current.send('Salut');
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    const failedId = result.current.messages[0]?.id;
    expect(result.current.messages[0]?.status).toBe('failed');

    mockSendMessageAction.mockResolvedValueOnce({
      message: { id: 'm1', conversationId: 'c1', senderId: 'me', content: 'Salut', messageType: 'text', createdAt: '2026-01-01T00:00:00Z', attachment: null },
    });

    await act(async () => {
      result.current.retry(failedId as string);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(mockSendMessageAction).toHaveBeenLastCalledWith('c1', 'Salut');
    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0]?.status).toBe('sent');
    expect(result.current.messages[0]?.id).toBe('m1');
  });

  it('hors connexion : l’envoi est bloqué localement, aucun appel serveur', async () => {
    mockUseOnlineStatus.mockReturnValue(false);
    const { client } = makeFakeClient();
    mockCreateClient.mockReturnValue(client);

    const { result } = renderHook(() => useMessages('c1', [], 'me'));
    await flush();

    act(() => {
      result.current.send('Salut');
    });

    expect(mockSendMessageAction).not.toHaveBeenCalled();
    expect(result.current.messages).toHaveLength(0);
    expect(result.current.isOnline).toBe(false);
  });

  describe('Realtime média (Phase 8.5.4)', () => {
    it('INSERT image : jamais construit depuis le payload brut, toujours rechargé par fetchMessageByIdAction puis affiché', async () => {
      const { client, handlers } = makeFakeClient();
      mockCreateClient.mockReturnValue(client);
      mockFetchMessageByIdAction.mockResolvedValue({
        id: 'm1',
        conversationId: 'c1',
        senderId: 'other',
        content: '',
        messageType: 'image',
        createdAt: '2026-01-01T00:00:00Z',
        attachment: { id: 'a1', mediaType: 'image', mimeType: 'image/jpeg', width: 800, height: 600, durationMs: null },
      });

      const { result } = renderHook(() => useMessages('c1', [], 'me'));
      await flush();

      await act(async () => {
        handlers.insert?.({
          new: { id: 'm1', conversation_id: 'c1', sender_id: 'other', content: '', message_type: 'image', created_at: '2026-01-01T00:00:00Z' },
        });
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      expect(mockFetchMessageByIdAction).toHaveBeenCalledWith('m1');
      expect(result.current.messages).toEqual([
        {
          id: 'm1',
          conversationId: 'c1',
          senderId: 'other',
          content: '',
          messageType: 'image',
          createdAt: '2026-01-01T00:00:00Z',
          attachment: { id: 'a1', mediaType: 'image', mimeType: 'image/jpeg', width: 800, height: 600, durationMs: null },
          status: 'sent',
        },
      ]);
    });

    it('INSERT vidéo : rechargé par fetchMessageByIdAction, pièce jointe fusionnée sans rechargement de page', async () => {
      const { client, handlers } = makeFakeClient();
      mockCreateClient.mockReturnValue(client);
      mockFetchMessageByIdAction.mockResolvedValue({
        id: 'm2',
        conversationId: 'c1',
        senderId: 'other',
        content: 'Regarde',
        messageType: 'video',
        createdAt: '2026-01-01T00:01:00Z',
        attachment: { id: 'a2', mediaType: 'video', mimeType: 'video/mp4', width: 640, height: 480, durationMs: 5000 },
      });

      const { result } = renderHook(() => useMessages('c1', [], 'me'));
      await flush();

      await act(async () => {
        handlers.insert?.({
          new: { id: 'm2', conversation_id: 'c1', sender_id: 'other', content: 'Regarde', message_type: 'video', created_at: '2026-01-01T00:01:00Z' },
        });
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      expect(result.current.messages[0]?.attachment?.mediaType).toBe('video');
      expect(result.current.messages[0]?.attachment?.id).toBe('a2');
    });

    it('aucun doublon : un message média déjà présent (sent) n’est jamais ajouté deux fois', async () => {
      const { client, handlers } = makeFakeClient();
      mockCreateClient.mockReturnValue(client);
      mockFetchMessageByIdAction.mockResolvedValue({
        id: 'm1',
        conversationId: 'c1',
        senderId: 'other',
        content: '',
        messageType: 'image',
        createdAt: '2026-01-01T00:00:00Z',
        attachment: { id: 'a1', mediaType: 'image', mimeType: 'image/jpeg', width: 800, height: 600, durationMs: null },
      });

      const initial = [
        {
          id: 'm1',
          conversationId: 'c1',
          senderId: 'other',
          content: '',
          messageType: 'image' as const,
          createdAt: '2026-01-01T00:00:00Z',
          attachment: { id: 'a1', mediaType: 'image' as const, mimeType: 'image/jpeg', width: 800, height: 600, durationMs: null },
        },
      ];
      const { result } = renderHook(() => useMessages('c1', initial, 'me'));
      await flush();

      await act(async () => {
        handlers.insert?.({
          new: { id: 'm1', conversation_id: 'c1', sender_id: 'other', content: '', message_type: 'image', created_at: '2026-01-01T00:00:00Z' },
        });
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      expect(result.current.messages).toHaveLength(1);
    });

    it('rechargement échoué (message supprimé entre-temps ou accès refusé) : ignoré silencieusement, jamais un message construit depuis le payload brut', async () => {
      const { client, handlers } = makeFakeClient();
      mockCreateClient.mockReturnValue(client);
      mockFetchMessageByIdAction.mockResolvedValue(null);

      const { result } = renderHook(() => useMessages('c1', [], 'me'));
      await flush();

      await act(async () => {
        handlers.insert?.({
          new: { id: 'm1', conversation_id: 'c1', sender_id: 'other', content: '', message_type: 'image', created_at: '2026-01-01T00:00:00Z' },
        });
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      expect(result.current.messages).toHaveLength(0);
    });
  });
});

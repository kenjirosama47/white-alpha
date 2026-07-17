import { act, renderHook, waitFor } from '@testing-library/react-native';
import NetInfo from '@react-native-community/netinfo';

import { useConversations } from '@/hooks/use-conversations';
import { listConversations } from '@/services/conversations';
import type { ConversationSummary } from '@/types/chat';

jest.mock('@/services/conversations', () => ({
  listConversations: jest.fn(),
}));

jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: { addEventListener: jest.fn(() => () => {}) },
}));

const mockAddEventListener = NetInfo.addEventListener as jest.Mock;

async function emitNetworkChange(
  listener: (state: { isConnected: boolean | null }) => void,
  state: { isConnected: boolean | null },
) {
  await act(async () => {
    listener(state);
    await Promise.resolve();
  });
}

const conversationA: ConversationSummary = {
  conversationId: 'c1',
  otherParticipant: { id: 'u2', username: 'bob', displayName: 'Bob', avatarUrl: null, avatarPreset: 'wolf_white_calm' },
  lastMessageContent: 'Salut',
  lastMessageCreatedAt: '2026-07-15T10:00:00Z',
};

const conversationB: ConversationSummary = {
  conversationId: 'c2',
  otherParticipant: { id: 'u3', username: 'alice', displayName: 'Alice', avatarUrl: null, avatarPreset: 'wolf_white_calm' },
  lastMessageContent: 'Yo',
  lastMessageCreatedAt: '2026-07-15T11:00:00Z',
};

describe('useConversations', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAddEventListener.mockReturnValue(() => {});
  });

  it('premier chargement : isLoading true puis la liste apparaît', async () => {
    (listConversations as jest.Mock).mockResolvedValue([conversationA]);

    const { result } = await renderHook(() => useConversations());

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.conversations).toEqual([conversationA]);
    expect(result.current.error).toBeNull();
  });

  it("erreur au premier chargement : message français, jamais brut, avec possibilité de réessayer via refresh", async () => {
    (listConversations as jest.Mock).mockRejectedValueOnce(
      new Error('Impossible de charger les conversations pour le moment.'),
    );

    const { result } = await renderHook(() => useConversations());
    await waitFor(() => expect(result.current.error).toBe('Impossible de charger les conversations pour le moment.'));

    (listConversations as jest.Mock).mockResolvedValueOnce([conversationA]);
    await act(async () => {
      result.current.refresh();
      await Promise.resolve();
    });

    await waitFor(() => expect(result.current.conversations).toEqual([conversationA]));
    expect(result.current.error).toBeNull();
  });

  it('actualisation (pull-to-refresh) : conserve la liste déjà affichée pendant le rechargement', async () => {
    (listConversations as jest.Mock).mockResolvedValueOnce([conversationA]);
    const { result } = await renderHook(() => useConversations());
    await waitFor(() => expect(result.current.conversations).toEqual([conversationA]));

    let resolveRefresh: (value: ConversationSummary[]) => void = () => {};
    (listConversations as jest.Mock).mockReturnValueOnce(
      new Promise((resolve) => {
        resolveRefresh = resolve;
      }),
    );

    await act(async () => {
      result.current.refresh();
      await Promise.resolve();
    });

    // La liste précédente reste visible pendant l'actualisation : jamais vidée en attendant.
    expect(result.current.conversations).toEqual([conversationA]);
    expect(result.current.isRefreshing).toBe(true);
    expect(result.current.isLoading).toBe(false);

    await act(async () => {
      resolveRefresh([conversationA, conversationB]);
      await Promise.resolve();
    });

    await waitFor(() => expect(result.current.conversations).toEqual([conversationA, conversationB]));
    expect(result.current.isRefreshing).toBe(false);
  });

  it("retour de connexion : resynchronise silencieusement (jamais isLoading ni isRefreshing)", async () => {
    let listener: (state: { isConnected: boolean | null }) => void = () => {};
    mockAddEventListener.mockImplementation((cb) => {
      listener = cb;
      return () => {};
    });

    (listConversations as jest.Mock).mockResolvedValueOnce([conversationA]);
    const { result } = await renderHook(() => useConversations());
    await waitFor(() => expect(result.current.conversations).toEqual([conversationA]));

    (listConversations as jest.Mock).mockResolvedValueOnce([conversationA, conversationB]);
    await emitNetworkChange(listener, { isConnected: false });
    await emitNetworkChange(listener, { isConnected: true });

    await waitFor(() => expect(result.current.conversations).toEqual([conversationA, conversationB]));
    // Jamais l'écran de chargement plein écran ni l'indicateur "tirer pour actualiser" pour une resynchronisation non demandée.
    expect(result.current.isLoading).toBe(false);
    expect(result.current.isRefreshing).toBe(false);
  });

  it("n'ouvre qu'un seul abonnement réseau (jamais recréé entre les rendus)", async () => {
    (listConversations as jest.Mock).mockResolvedValue([]);
    const { rerender } = await renderHook(() => useConversations());
    await act(async () => {
      rerender(undefined);
    });

    expect(mockAddEventListener).toHaveBeenCalledTimes(1);
  });
});

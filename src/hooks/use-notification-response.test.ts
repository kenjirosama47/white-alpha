import { renderHook } from '@testing-library/react-native';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';

import { useAuth } from '@/contexts/auth-context';
import { useNotificationResponseNavigation } from '@/hooks/use-notification-response';
import { getConversationForNotification } from '@/services/conversations';

jest.mock('expo-notifications', () => ({
  addNotificationResponseReceivedListener: jest.fn(),
}));

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn() },
}));

jest.mock('@/contexts/auth-context', () => ({
  useAuth: jest.fn(),
}));

jest.mock('@/services/conversations', () => ({
  getConversationForNotification: jest.fn(),
}));

function fireResponse(data: Record<string, unknown>) {
  const listener = (Notifications.addNotificationResponseReceivedListener as jest.Mock).mock.calls[0][0];
  return listener({ notification: { request: { content: { data } } } });
}

beforeEach(() => {
  jest.clearAllMocks();
  (Notifications.addNotificationResponseReceivedListener as jest.Mock).mockReturnValue({ remove: jest.fn() });
});

describe('useNotificationResponseNavigation', () => {
  it('ignore le tap si aucune session active (le flux d\'authentification normal reprend la main)', async () => {
    (useAuth as jest.Mock).mockReturnValue({ isAuthenticated: false });
    await renderHook(() => useNotificationResponseNavigation());

    await fireResponse({ conversationId: 'c1' });

    expect(getConversationForNotification).not.toHaveBeenCalled();
    expect(router.push).not.toHaveBeenCalled();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('ignore un payload sans conversationId', async () => {
    (useAuth as jest.Mock).mockReturnValue({ isAuthenticated: true });
    await renderHook(() => useNotificationResponseNavigation());

    await fireResponse({});

    expect(getConversationForNotification).not.toHaveBeenCalled();
  });

  it("revalide l'appartenance puis ouvre la conversation avec des données rechargées depuis Supabase", async () => {
    (useAuth as jest.Mock).mockReturnValue({ isAuthenticated: true });
    (getConversationForNotification as jest.Mock).mockResolvedValue({
      conversationId: 'c1',
      id: 'u2',
      username: 'bob',
      displayName: 'Bob',
      avatarUrl: null,
    });
    await renderHook(() => useNotificationResponseNavigation());

    await fireResponse({ conversationId: 'c1' });
    await Promise.resolve();
    await Promise.resolve();

    expect(getConversationForNotification).toHaveBeenCalledWith('c1');
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/conversation/[id]',
      params: { id: 'c1', otherUsername: 'bob', otherDisplayName: 'Bob', otherAvatarUrl: '' },
    });
  });

  it("revient à l'écran Conversations si l'accès a été perdu (aucune ligne renvoyée), jamais une erreur affichée", async () => {
    (useAuth as jest.Mock).mockReturnValue({ isAuthenticated: true });
    (getConversationForNotification as jest.Mock).mockResolvedValue(null);
    await renderHook(() => useNotificationResponseNavigation());

    await fireResponse({ conversationId: 'c1' });
    await Promise.resolve();
    await Promise.resolve();

    expect(router.replace).toHaveBeenCalledWith('/');
    expect(router.push).not.toHaveBeenCalled();
  });

  it('revient à Conversations si la revalidation échoue (ex. session expirée entre-temps)', async () => {
    (useAuth as jest.Mock).mockReturnValue({ isAuthenticated: true });
    (getConversationForNotification as jest.Mock).mockRejectedValue(new Error('JWT expired'));
    await renderHook(() => useNotificationResponseNavigation());

    await fireResponse({ conversationId: 'c1' });
    await Promise.resolve();
    await Promise.resolve();

    expect(router.replace).toHaveBeenCalledWith('/');
  });
});

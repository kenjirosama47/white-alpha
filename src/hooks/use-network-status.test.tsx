import { act, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';
import NetInfo from '@react-native-community/netinfo';

import { useNetworkStatus } from '@/hooks/use-network-status';

jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: { addEventListener: jest.fn(() => () => {}) },
}));

const mockAddEventListener = NetInfo.addEventListener as jest.Mock;

function NetworkStatusProbe() {
  const { isOffline, justReconnected } = useNetworkStatus();
  return <Text>{JSON.stringify({ isOffline, justReconnected })}</Text>;
}

function readProbeState(): { isOffline: boolean; justReconnected: boolean } {
  return JSON.parse(screen.getByText(/isOffline/).props.children);
}

/**
 * Invoque le listener NetInfo capturé et attend le re-rendu qui en résulte.
 * Dans cet environnement de test, un `act(() => { listener(...) })`
 * synchrone ne suffit pas toujours à faire apparaître la mise à jour dans le
 * texte rendu pour un état déclenché par un callback externe (pas une
 * promesse résolue comme pour les autres hooks du projet) : un `act` async
 * avec un tick de micro-tâche est nécessaire pour flush de façon fiable.
 */
async function emitNetworkChange(
  listener: (state: { isConnected: boolean | null }) => void,
  state: { isConnected: boolean | null },
) {
  await act(async () => {
    listener(state);
    await Promise.resolve();
  });
}

describe('useNetworkStatus', () => {
  beforeEach(() => {
    mockAddEventListener.mockReset();
    mockAddEventListener.mockReturnValue(() => {});
  });

  it("commence en ligne par défaut (état initial optimiste, jamais de faux bandeau au premier rendu)", async () => {
    await render(<NetworkStatusProbe />);

    expect(readProbeState()).toEqual({ isOffline: false, justReconnected: false });
  });

  it('passe hors ligne quand NetInfo rapporte isConnected: false', async () => {
    let listener: (state: { isConnected: boolean | null }) => void = () => {};
    mockAddEventListener.mockImplementation((cb) => {
      listener = cb;
      return () => {};
    });

    await render(<NetworkStatusProbe />);
    await emitNetworkChange(listener, { isConnected: false });

    expect(readProbeState().isOffline).toBe(true);
  });

  it('traite isConnected: null comme "connecté" (optimiste), pas hors ligne', async () => {
    let listener: (state: { isConnected: boolean | null }) => void = () => {};
    mockAddEventListener.mockImplementation((cb) => {
      listener = cb;
      return () => {};
    });

    await render(<NetworkStatusProbe />);
    await emitNetworkChange(listener, { isConnected: null });

    expect(readProbeState().isOffline).toBe(false);
  });

  it('signale justReconnected brièvement au retour de connexion, puis retombe à false', async () => {
    let listener: (state: { isConnected: boolean | null }) => void = () => {};
    mockAddEventListener.mockImplementation((cb) => {
      listener = cb;
      return () => {};
    });

    await render(<NetworkStatusProbe />);

    await emitNetworkChange(listener, { isConnected: false });
    expect(readProbeState().justReconnected).toBe(false);

    await emitNetworkChange(listener, { isConnected: true });
    expect(readProbeState()).toEqual({ isOffline: false, justReconnected: true });

    // Délai réel (pas de fake timers) : le bandeau "Connexion rétablie"
    // disparaît après 3s.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 3100));
    });
    expect(readProbeState().justReconnected).toBe(false);
  }, 10000);

  it('se désabonne au démontage', async () => {
    const unsubscribe = jest.fn();
    mockAddEventListener.mockReturnValue(unsubscribe);

    const { unmount } = await render(<NetworkStatusProbe />);
    await unmount();

    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});

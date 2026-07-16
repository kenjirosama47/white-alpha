import { act, render, screen } from '@testing-library/react-native';
import NetInfo from '@react-native-community/netinfo';

import { OfflineBanner } from '@/components/offline-banner';

jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: { addEventListener: jest.fn(() => () => {}) },
}));

const mockAddEventListener = NetInfo.addEventListener as jest.Mock;

/** Voir la même note dans use-network-status.test.tsx : un act() async avec un tick est nécessaire ici. */
async function emitNetworkChange(
  listener: (state: { isConnected: boolean | null }) => void,
  state: { isConnected: boolean | null },
) {
  await act(async () => {
    listener(state);
    await Promise.resolve();
  });
}

describe('OfflineBanner', () => {
  let listener: (state: { isConnected: boolean | null }) => void = () => {};

  beforeEach(() => {
    mockAddEventListener.mockReset();
    mockAddEventListener.mockImplementation((cb) => {
      listener = cb;
      return () => {};
    });
  });

  it("n'affiche rien quand la connexion est stable", async () => {
    await render(<OfflineBanner />);

    expect(screen.queryByText('Aucune connexion Internet')).toBeNull();
    expect(screen.queryByText('Connexion rétablie')).toBeNull();
  });

  it('affiche "Aucune connexion Internet" pendant une coupure', async () => {
    await render(<OfflineBanner />);
    await emitNetworkChange(listener, { isConnected: false });

    const banner = screen.getByText('Aucune connexion Internet');
    expect(banner).toBeTruthy();
    expect(screen.getByLabelText('Aucune connexion Internet').props.accessibilityRole).toBe('alert');
  });

  it('affiche brièvement "Connexion rétablie" au retour du réseau', async () => {
    await render(<OfflineBanner />);
    await emitNetworkChange(listener, { isConnected: false });
    await emitNetworkChange(listener, { isConnected: true });

    expect(screen.queryByText('Aucune connexion Internet')).toBeNull();
    expect(screen.getByText('Connexion rétablie')).toBeTruthy();
  });

  it('ne recrée jamais un second abonnement réseau (un seul écouteur NetInfo)', async () => {
    const { rerender } = await render(<OfflineBanner />);
    await act(async () => {
      rerender(<OfflineBanner />);
    });

    expect(mockAddEventListener).toHaveBeenCalledTimes(1);
  });
});

import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { MessageVideo } from '@/components/message-video';

const mockRefresh = jest.fn();
let mockUrlState: { url: string | null; isLoading: boolean; error: string | null };

jest.mock('@/hooks/use-signed-attachment-url', () => ({
  useSignedAttachmentUrl: () => ({ ...mockUrlState, refresh: mockRefresh }),
}));

const mockPause = jest.fn();
const mockPlay = jest.fn();
const mockReplaceAsync = jest.fn();
let mockPlayerStatus: 'idle' | 'loading' | 'readyToPlay' | 'error' = 'idle';
let mockPlayerError: { message: string } | undefined;

const mockPlayer = {
  loop: false,
  staysActiveInBackground: false,
  status: 'idle',
  pause: mockPause,
  play: mockPlay,
  replaceAsync: mockReplaceAsync,
};

jest.mock('expo-video', () => ({
  useVideoPlayer: (_source: unknown, setup?: (p: typeof mockPlayer) => void) => {
    setup?.(mockPlayer);
    return mockPlayer;
  },
  VideoView: 'VideoView',
}));

jest.mock('expo', () => ({
  useEvent: () => ({ status: mockPlayerStatus, error: mockPlayerError }),
}));

describe('MessageVideo', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPlayerStatus = 'idle';
    mockPlayerError = undefined;
    mockReplaceAsync.mockResolvedValue(undefined);
  });

  it('affiche un indicateur de chargement tant que l’URL signée n’est pas prête', async () => {
    mockUrlState = { url: null, isLoading: true, error: null };

    await render(<MessageVideo storagePath="conv-1/user-1/clip.mp4" width={1280} height={720} durationMs={15_000} />);

    expect(screen.queryByText('▶')).toBeNull();
  });

  it('affiche un fond neutre avec icône lecture et la durée avant tout chargement de vidéo (pas d’autoplay)', async () => {
    mockUrlState = { url: 'https://signed.example/clip.mp4', isLoading: false, error: null };

    await render(<MessageVideo storagePath="conv-1/user-1/clip.mp4" width={1280} height={720} durationMs={15_000} />);

    expect(screen.getByText('▶')).toBeTruthy();
    expect(screen.getByText('0:15')).toBeTruthy();
    expect(mockReplaceAsync).not.toHaveBeenCalled();
    expect(mockPlay).not.toHaveBeenCalled();
  });

  it('charge et lance la lecture uniquement après une action explicite de l’utilisateur (tap sur le bouton lecture)', async () => {
    mockUrlState = { url: 'https://signed.example/clip.mp4', isLoading: false, error: null };

    await render(<MessageVideo storagePath="conv-1/user-1/clip.mp4" width={1280} height={720} durationMs={15_000} />);

    fireEvent.press(screen.getByText('▶'));

    await waitFor(() => expect(mockReplaceAsync).toHaveBeenCalledWith('https://signed.example/clip.mp4'));
    expect(mockPlay).toHaveBeenCalledTimes(1);
  });

  it('affiche une erreur de chargement d’URL signée avec possibilité de réessayer', async () => {
    mockUrlState = { url: null, isLoading: false, error: "Impossible de charger l'image pour le moment." };

    await render(<MessageVideo storagePath="conv-1/user-1/clip.mp4" width={1280} height={720} durationMs={15_000} />);

    fireEvent.press(screen.getByText(/Toucher pour réessayer/));

    expect(mockRefresh).toHaveBeenCalledTimes(1);
  });

  it('met le lecteur en pause au démontage (fermeture de l’écran)', async () => {
    mockUrlState = { url: 'https://signed.example/clip.mp4', isLoading: false, error: null };

    const { unmount } = await render(
      <MessageVideo storagePath="conv-1/user-1/clip.mp4" width={1280} height={720} durationMs={15_000} />,
    );

    await unmount();

    expect(mockPause).toHaveBeenCalledTimes(1);
  });
});

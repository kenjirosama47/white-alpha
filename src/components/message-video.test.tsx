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

  it("n'appelle jamais pause()/play() explicitement sur le lecteur au démontage : useVideoPlayer le libère déjà seul", async () => {
    // `player.pause()` explicite ici serait exécuté APRÈS la libération
    // automatique de useVideoPlayer (les cleanups s'exécutent dans l'ordre de
    // déclaration des effets) : côté natif Android, cela revient à appeler
    // une méthode sur un lecteur ExoPlayer déjà (ou en cours de) libéré, ce
    // qui provoque un crash natif fermant complètement l'application — c'est
    // exactement le bug corrigé en Phase 5.4 (suppression d'une vidéo).
    mockUrlState = { url: 'https://signed.example/clip.mp4', isLoading: false, error: null };

    const { unmount } = await render(
      <MessageVideo storagePath="conv-1/user-1/clip.mp4" width={1280} height={720} durationMs={15_000} />,
    );

    await unmount();

    expect(mockPause).not.toHaveBeenCalled();
  });

  it('démonté pendant le chargement (tap lecture puis suppression avant la fin de replaceAsync) : ne joue jamais sur un lecteur déjà démonté', async () => {
    mockUrlState = { url: 'https://signed.example/clip.mp4', isLoading: false, error: null };
    let resolveReplace: () => void = () => {};
    mockReplaceAsync.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveReplace = resolve;
      }),
    );

    const { unmount } = await render(
      <MessageVideo storagePath="conv-1/user-1/clip.mp4" width={1280} height={720} durationMs={15_000} />,
    );

    fireEvent.press(screen.getByText('▶'));
    await waitFor(() => expect(mockReplaceAsync).toHaveBeenCalledTimes(1));

    // Le message (et donc ce composant) est supprimé pendant que
    // `replaceAsync` est encore en vol.
    await unmount();

    // `replaceAsync` finit par se résoudre après coup : `play()` ne doit
    // jamais être appelé sur ce lecteur désormais démonté/libéré.
    resolveReplace();
    await Promise.resolve();
    await Promise.resolve();

    expect(mockPlay).not.toHaveBeenCalled();
  });
});

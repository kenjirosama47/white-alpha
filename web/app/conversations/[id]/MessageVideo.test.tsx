import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { getSignedAttachmentUrlAction } from './actions';
import { MessageVideo } from './MessageVideo';

jest.mock('./actions', () => ({
  getSignedAttachmentUrlAction: jest.fn(),
}));

const mockGetSignedAttachmentUrlAction = getSignedAttachmentUrlAction as jest.Mock;

describe('MessageVideo (Phase 8.5.4)', () => {
  beforeEach(() => {
    mockGetSignedAttachmentUrlAction.mockReset();
  });

  it('état chargement affiché pendant la résolution de l’URL signée', () => {
    mockGetSignedAttachmentUrlAction.mockReturnValue(new Promise(() => {}));

    render(<MessageVideo attachmentId="a1" width={640} height={480} />);

    expect(screen.getByRole('status', { name: 'Chargement de la vidéo' })).toBeInTheDocument();
  });

  it('vidéo affichée avec contrôles natifs, preload="metadata", jamais autoplay', async () => {
    mockGetSignedAttachmentUrlAction.mockResolvedValue('https://example.supabase.co/signed/a1');

    const { container } = render(<MessageVideo attachmentId="a1" width={640} height={480} />);

    await waitFor(() => expect(container.querySelector('video')).toBeTruthy());
    const video = container.querySelector('video') as HTMLVideoElement;

    expect(video).toHaveAttribute('src', 'https://example.supabase.co/signed/a1');
    expect(video).toHaveAttribute('controls');
    expect(video).toHaveAttribute('preload', 'metadata');
    expect(video).not.toHaveAttribute('autoplay');
    expect(video).not.toHaveAttribute('autoPlay');
  });

  it('dimensions réservées (aspect-ratio) calculées depuis width/height', async () => {
    mockGetSignedAttachmentUrlAction.mockResolvedValue('https://example.supabase.co/signed/a1');

    const { container } = render(<MessageVideo attachmentId="a1" width={640} height={320} />);

    await waitFor(() => expect(container.querySelector('video')).toBeTruthy());
    const video = container.querySelector('video') as HTMLVideoElement;
    expect(video.style.aspectRatio).toBe('2');
  });

  it('erreur de résolution de l’URL signée : état d’erreur avec bouton Réessayer', async () => {
    mockGetSignedAttachmentUrlAction.mockResolvedValue(null);

    render(<MessageVideo attachmentId="a1" width={640} height={480} />);

    await screen.findByText('Vidéo indisponible.');
    expect(screen.getByRole('button', { name: 'Réessayer' })).toBeInTheDocument();
  });

  it('erreur de chargement du média (onError de l’élément video) : état d’erreur avec bouton Réessayer', async () => {
    mockGetSignedAttachmentUrlAction.mockResolvedValue('https://example.supabase.co/signed/a1');

    const { container } = render(<MessageVideo attachmentId="a1" width={640} height={480} />);
    await waitFor(() => expect(container.querySelector('video')).toBeTruthy());

    fireEvent.error(container.querySelector('video') as HTMLVideoElement);

    expect(await screen.findByText('Vidéo indisponible.')).toBeInTheDocument();
  });

  it('bouton Réessayer génère une nouvelle demande d’URL signée', async () => {
    mockGetSignedAttachmentUrlAction.mockResolvedValueOnce(null).mockResolvedValueOnce('https://example.supabase.co/signed/frais');

    render(<MessageVideo attachmentId="a1" width={640} height={480} />);
    await screen.findByText('Vidéo indisponible.');

    fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }));

    await waitFor(() => expect(mockGetSignedAttachmentUrlAction).toHaveBeenCalledTimes(2));
  });
});

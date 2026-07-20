import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { getSignedAttachmentUrlAction } from './actions';
import { MessageImage } from './MessageImage';

jest.mock('./actions', () => ({
  getSignedAttachmentUrlAction: jest.fn(),
}));

const mockGetSignedAttachmentUrlAction = getSignedAttachmentUrlAction as jest.Mock;

describe('MessageImage (Phase 8.5.4)', () => {
  beforeEach(() => {
    mockGetSignedAttachmentUrlAction.mockReset();
  });

  it('état chargement affiché pendant la résolution de l’URL signée', () => {
    mockGetSignedAttachmentUrlAction.mockReturnValue(new Promise(() => {}));

    render(<MessageImage attachmentId="a1" width={800} height={600} />);

    expect(screen.getByRole('status', { name: "Chargement de l'image" })).toBeInTheDocument();
  });

  it('image affichée avec un texte alternatif générique une fois l’URL signée résolue', async () => {
    mockGetSignedAttachmentUrlAction.mockResolvedValue('https://example.supabase.co/signed/a1');

    render(<MessageImage attachmentId="a1" width={800} height={600} />);

    const img = await screen.findByRole('img', { name: 'Photo envoyée dans la conversation' });
    expect(img).toHaveAttribute('src', 'https://example.supabase.co/signed/a1');
    expect(img).toHaveAttribute('loading', 'lazy');
  });

  it('dimensions réservées (aspect-ratio) calculées depuis width/height pour éviter un saut de mise en page', async () => {
    mockGetSignedAttachmentUrlAction.mockResolvedValue('https://example.supabase.co/signed/a1');

    render(<MessageImage attachmentId="a1" width={800} height={500} />);

    const img = await screen.findByRole('img');
    expect(img.style.aspectRatio).toBe('1.6');
  });

  it('dimensions absentes : un ratio de repli est appliqué, jamais un plantage', async () => {
    mockGetSignedAttachmentUrlAction.mockResolvedValue('https://example.supabase.co/signed/a1');

    render(<MessageImage attachmentId="a1" width={null} height={null} />);

    const img = await screen.findByRole('img');
    expect(img.style.aspectRatio).not.toBe('');
  });

  it('erreur de résolution de l’URL signée : état d’erreur avec bouton Réessayer', async () => {
    mockGetSignedAttachmentUrlAction.mockResolvedValue(null);

    render(<MessageImage attachmentId="a1" width={800} height={600} />);

    await screen.findByText('Image indisponible.');
    expect(screen.getByRole('button', { name: 'Réessayer' })).toBeInTheDocument();
  });

  it('erreur de chargement du média (onError de l’élément img) : état d’erreur avec bouton Réessayer', async () => {
    mockGetSignedAttachmentUrlAction.mockResolvedValue('https://example.supabase.co/signed/a1');

    render(<MessageImage attachmentId="a1" width={800} height={600} />);
    const img = await screen.findByRole('img');

    fireEvent.error(img);

    expect(await screen.findByText('Image indisponible.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Réessayer' })).toBeInTheDocument();
  });

  it('bouton Réessayer génère une nouvelle demande d’URL signée', async () => {
    mockGetSignedAttachmentUrlAction.mockResolvedValueOnce(null).mockResolvedValueOnce('https://example.supabase.co/signed/frais');

    render(<MessageImage attachmentId="a1" width={800} height={600} />);
    await screen.findByText('Image indisponible.');

    fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }));

    await waitFor(() => expect(mockGetSignedAttachmentUrlAction).toHaveBeenCalledTimes(2));
    expect(await screen.findByRole('img')).toHaveAttribute('src', 'https://example.supabase.co/signed/frais');
  });
});

import { renderHook, waitFor } from '@testing-library/react-native';

import { useSignedAttachmentUrl } from '@/hooks/use-signed-attachment-url';
import { getSignedAttachmentUrl } from '@/services/media';

jest.mock('@/services/media', () => ({
  getSignedAttachmentUrl: jest.fn(),
}));

describe('useSignedAttachmentUrl', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('charge une URL signée au montage', async () => {
    (getSignedAttachmentUrl as jest.Mock).mockResolvedValue('https://signed.example/a');

    const { result } = await renderHook(() => useSignedAttachmentUrl('conv-1/user-1/a.jpg'));

    await waitFor(() => expect(result.current.url).toBe('https://signed.example/a'));
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('expose une erreur française si la génération échoue', async () => {
    (getSignedAttachmentUrl as jest.Mock).mockRejectedValue(new Error("Impossible de charger l'image pour le moment."));

    const { result } = await renderHook(() => useSignedAttachmentUrl('conv-1/user-1/a.jpg'));

    await waitFor(() => expect(result.current.error).toBe("Impossible de charger l'image pour le moment."));
    expect(result.current.url).toBeNull();
  });

  it('refresh() redemande une nouvelle URL signée (jamais réutilisée après expiration)', async () => {
    (getSignedAttachmentUrl as jest.Mock)
      .mockResolvedValueOnce('https://signed.example/first')
      .mockResolvedValueOnce('https://signed.example/second');

    const { result } = await renderHook(() => useSignedAttachmentUrl('conv-1/user-1/a.jpg'));
    await waitFor(() => expect(result.current.url).toBe('https://signed.example/first'));

    result.current.refresh();

    await waitFor(() => expect(result.current.url).toBe('https://signed.example/second'));
    expect(getSignedAttachmentUrl).toHaveBeenCalledTimes(2);
  });
});

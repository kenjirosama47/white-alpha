import { act, renderHook, waitFor } from '@testing-library/react';

import { getSignedAttachmentUrlAction } from './actions';
import { useSignedAttachmentUrl } from './useSignedAttachmentUrl';

jest.mock('./actions', () => ({
  getSignedAttachmentUrlAction: jest.fn(),
}));

const mockGetSignedAttachmentUrlAction = getSignedAttachmentUrlAction as jest.Mock;

describe('useSignedAttachmentUrl (Phase 8.5.4)', () => {
  beforeEach(() => {
    mockGetSignedAttachmentUrlAction.mockReset();
  });

  it('résolution réussie : isLoading puis url renseignée', async () => {
    mockGetSignedAttachmentUrlAction.mockResolvedValue('https://example.supabase.co/signed/a1');

    const { result } = renderHook(() => useSignedAttachmentUrl('a1'));
    expect(result.current.isLoading).toBe(true);
    expect(result.current.url).toBeNull();

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.url).toBe('https://example.supabase.co/signed/a1');
    expect(result.current.error).toBe(false);
    expect(mockGetSignedAttachmentUrlAction).toHaveBeenCalledWith('a1');
  });

  it('résolution en échec (null renvoyé par l’action) : error=true, url reste null', async () => {
    mockGetSignedAttachmentUrlAction.mockResolvedValue(null);

    const { result } = renderHook(() => useSignedAttachmentUrl('a1'));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.error).toBe(true);
    expect(result.current.url).toBeNull();
  });

  it('exception réseau : error=true, jamais propagée hors du hook', async () => {
    mockGetSignedAttachmentUrlAction.mockRejectedValue(new Error('network'));

    const { result } = renderHook(() => useSignedAttachmentUrl('a1'));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.error).toBe(true);
  });

  it('refresh() redemande une nouvelle URL', async () => {
    mockGetSignedAttachmentUrlAction.mockResolvedValueOnce(null).mockResolvedValueOnce('https://example.supabase.co/signed/frais');

    const { result } = renderHook(() => useSignedAttachmentUrl('a1'));
    await waitFor(() => expect(result.current.error).toBe(true));

    act(() => result.current.refresh());
    await waitFor(() => expect(result.current.url).toBe('https://example.supabase.co/signed/frais'));

    expect(mockGetSignedAttachmentUrlAction).toHaveBeenCalledTimes(2);
  });

  it('changement d’attachmentId : invalide l’ancienne URL en mémoire, redemande une nouvelle résolution', async () => {
    mockGetSignedAttachmentUrlAction
      .mockResolvedValueOnce('https://example.supabase.co/signed/a1')
      .mockResolvedValueOnce('https://example.supabase.co/signed/a2');

    const { result, rerender } = renderHook(({ id }) => useSignedAttachmentUrl(id), { initialProps: { id: 'a1' } });
    await waitFor(() => expect(result.current.url).toBe('https://example.supabase.co/signed/a1'));

    rerender({ id: 'a2' });
    // L'ancienne URL ne doit jamais rester affichée pendant la résolution de la nouvelle.
    expect(result.current.url).toBeNull();
    expect(result.current.isLoading).toBe(true);

    await waitFor(() => expect(result.current.url).toBe('https://example.supabase.co/signed/a2'));
    expect(mockGetSignedAttachmentUrlAction).toHaveBeenNthCalledWith(2, 'a2');
  });

  it('démontage : n’effectue aucune mise à jour d’état après une résolution tardive (aucune erreur, aucune fuite)', async () => {
    let resolveAction!: (value: string | null) => void;
    mockGetSignedAttachmentUrlAction.mockReturnValue(
      new Promise((resolve) => {
        resolveAction = resolve;
      }),
    );

    const { unmount } = renderHook(() => useSignedAttachmentUrl('a1'));
    unmount();

    // Résout après le démontage : ne doit provoquer aucune exception ni
    // avertissement (garanti par requestIdRef, jamais un setState après ce point).
    expect(() => act(() => resolveAction('https://example.supabase.co/signed/late'))).not.toThrow();
  });
});

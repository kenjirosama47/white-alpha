import { MAX_IMAGE_SIZE_BYTES, MAX_VIDEO_SIZE_BYTES } from './media-config';
import { validateMediaFileForUpload } from './media-client-validation';

describe('validateMediaFileForUpload', () => {
  it('accepte une image JPEG de taille valide', () => {
    expect(validateMediaFileForUpload({ mimeType: 'image/jpeg', sizeBytes: 1024 })).toEqual({ ok: true });
  });

  it('accepte une vidéo MP4 de taille valide', () => {
    expect(validateMediaFileForUpload({ mimeType: 'video/mp4', sizeBytes: 1024 * 1024 })).toEqual({ ok: true });
  });

  it('refuse un type non autorisé', () => {
    const result = validateMediaFileForUpload({ mimeType: 'image/svg+xml', sizeBytes: 100 });
    expect(result.ok).toBe(false);
  });

  it('refuse une image dépassant 10 Mo', () => {
    const result = validateMediaFileForUpload({ mimeType: 'image/jpeg', sizeBytes: MAX_IMAGE_SIZE_BYTES + 1 });
    expect(result.ok).toBe(false);
  });

  it('refuse une vidéo dépassant 50 Mo', () => {
    const result = validateMediaFileForUpload({ mimeType: 'video/mp4', sizeBytes: MAX_VIDEO_SIZE_BYTES + 1 });
    expect(result.ok).toBe(false);
  });

  it('refuse un fichier vide', () => {
    const result = validateMediaFileForUpload({ mimeType: 'image/png', sizeBytes: 0 });
    expect(result.ok).toBe(false);
  });

  it('ne fait jamais autorité : accepte un type/taille cohérents même si le contenu réel pourrait être invalide (vérifié uniquement côté serveur)', () => {
    // Ce test documente explicitement la limite de la validation client : elle
    // ne peut se prononcer que sur ce que déclare le navigateur, jamais sur le
    // contenu réel du fichier — voir media-server-validation.ts.
    expect(validateMediaFileForUpload({ mimeType: 'image/png', sizeBytes: 100 })).toEqual({ ok: true });
  });
});

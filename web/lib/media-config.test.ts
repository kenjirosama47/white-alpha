import { MAX_IMAGE_SIZE_BYTES, MAX_VIDEO_SIZE_BYTES, isAllowedMimeType, maxSizeForMimeType, mediaKindForMimeType } from './media-config';

describe('mediaKindForMimeType', () => {
  it('reconnaît les types image', () => {
    expect(mediaKindForMimeType('image/jpeg')).toBe('image');
    expect(mediaKindForMimeType('image/png')).toBe('image');
    expect(mediaKindForMimeType('image/webp')).toBe('image');
  });

  it('reconnaît les types vidéo', () => {
    expect(mediaKindForMimeType('video/mp4')).toBe('video');
    expect(mediaKindForMimeType('video/webm')).toBe('video');
  });

  it('renvoie null pour un type non autorisé', () => {
    expect(mediaKindForMimeType('image/svg+xml')).toBeNull();
    expect(mediaKindForMimeType('text/html')).toBeNull();
    expect(mediaKindForMimeType('application/pdf')).toBeNull();
  });
});

describe('isAllowedMimeType', () => {
  it('accepte uniquement les types de la liste blanche', () => {
    expect(isAllowedMimeType('image/jpeg')).toBe(true);
    expect(isAllowedMimeType('video/webm')).toBe(true);
  });

  it('refuse SVG, GIF, HTML, PDF, archives, scripts, exécutables', () => {
    expect(isAllowedMimeType('image/svg+xml')).toBe(false);
    expect(isAllowedMimeType('image/gif')).toBe(false);
    expect(isAllowedMimeType('text/html')).toBe(false);
    expect(isAllowedMimeType('application/pdf')).toBe(false);
    expect(isAllowedMimeType('application/zip')).toBe(false);
    expect(isAllowedMimeType('application/javascript')).toBe(false);
    expect(isAllowedMimeType('application/x-msdownload')).toBe(false);
  });

  it('refuse null/undefined/chaîne vide', () => {
    expect(isAllowedMimeType(null)).toBe(false);
    expect(isAllowedMimeType(undefined)).toBe(false);
    expect(isAllowedMimeType('')).toBe(false);
  });
});

describe('maxSizeForMimeType', () => {
  it('applique 10 Mo pour une image', () => {
    expect(maxSizeForMimeType('image/jpeg')).toBe(MAX_IMAGE_SIZE_BYTES);
  });

  it('applique 50 Mo pour une vidéo', () => {
    expect(maxSizeForMimeType('video/mp4')).toBe(MAX_VIDEO_SIZE_BYTES);
  });
});

describe('limites métier — valeurs numériques exactes (Phase 8.5.5, non affectées par le correctif proxyClientMaxBodySize)', () => {
  it('MAX_IMAGE_SIZE_BYTES reste strictement 10 Mo (10 485 760 octets)', () => {
    expect(MAX_IMAGE_SIZE_BYTES).toBe(10 * 1024 * 1024);
  });

  it('MAX_VIDEO_SIZE_BYTES reste strictement 50 Mo (52 428 800 octets) — jamais 60 Mo (proxyClientMaxBodySize n’est qu’un plafond de transport, pas une limite métier)', () => {
    expect(MAX_VIDEO_SIZE_BYTES).toBe(50 * 1024 * 1024);
  });
});

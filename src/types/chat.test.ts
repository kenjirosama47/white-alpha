import { MESSAGE_MAX_LENGTH, validateImageFile, validateMessageContent, validateSearchQuery, validateVideoFile } from '@/types/chat';

describe('validateSearchQuery', () => {
  it('rejette une recherche trop courte (moins de 2 caractères)', () => {
    expect(validateSearchQuery('a').ok).toBe(false);
    expect(validateSearchQuery(' a ').ok).toBe(false);
    expect(validateSearchQuery('').ok).toBe(false);
  });

  it('accepte une recherche de 2 caractères ou plus', () => {
    expect(validateSearchQuery('ab').ok).toBe(true);
    expect(validateSearchQuery('phase3_user_b').ok).toBe(true);
  });
});

describe('validateMessageContent', () => {
  it('rejette un message vide (après trim)', () => {
    expect(validateMessageContent('').ok).toBe(false);
    expect(validateMessageContent('   ').ok).toBe(false);
  });

  it('rejette un message supérieur à 4000 caractères', () => {
    const tooLong = 'a'.repeat(MESSAGE_MAX_LENGTH + 1);
    expect(validateMessageContent(tooLong).ok).toBe(false);
  });

  it('accepte un message entre 1 et 4000 caractères', () => {
    expect(validateMessageContent('Salut !').ok).toBe(true);
    expect(validateMessageContent('a'.repeat(MESSAGE_MAX_LENGTH)).ok).toBe(true);
  });
});

describe('validateImageFile', () => {
  it('rejette un type MIME interdit', () => {
    const result = validateImageFile({ mimeType: 'image/gif', sizeBytes: 1000 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/format/i);
  });

  it('rejette un type MIME manquant', () => {
    expect(validateImageFile({ mimeType: null, sizeBytes: 1000 }).ok).toBe(false);
    expect(validateImageFile({ mimeType: undefined, sizeBytes: 1000 }).ok).toBe(false);
  });

  it('rejette un fichier de plus de 10 Mo', () => {
    const result = validateImageFile({ mimeType: 'image/jpeg', sizeBytes: 10 * 1024 * 1024 + 1 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/10 Mo/);
  });

  it('rejette une taille invalide (zéro, négative ou non finie)', () => {
    expect(validateImageFile({ mimeType: 'image/jpeg', sizeBytes: 0 }).ok).toBe(false);
    expect(validateImageFile({ mimeType: 'image/jpeg', sizeBytes: -1 }).ok).toBe(false);
    expect(validateImageFile({ mimeType: 'image/jpeg', sizeBytes: NaN }).ok).toBe(false);
  });

  it('accepte jpeg/png/webp jusqu’à 10 Mo', () => {
    expect(validateImageFile({ mimeType: 'image/jpeg', sizeBytes: 10 * 1024 * 1024 }).ok).toBe(true);
    expect(validateImageFile({ mimeType: 'image/png', sizeBytes: 1 }).ok).toBe(true);
    expect(validateImageFile({ mimeType: 'image/webp', sizeBytes: 500 }).ok).toBe(true);
  });
});

describe('validateVideoFile', () => {
  it('rejette un format non MP4', () => {
    const result = validateVideoFile({ mimeType: 'video/quicktime', sizeBytes: 1000, durationMs: 5000 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/MP4/);
  });

  it('rejette un type MIME manquant', () => {
    expect(validateVideoFile({ mimeType: null, sizeBytes: 1000, durationMs: 5000 }).ok).toBe(false);
    expect(validateVideoFile({ mimeType: undefined, sizeBytes: 1000, durationMs: 5000 }).ok).toBe(false);
  });

  it('rejette une vidéo vide (0 octet) avec le message dédié taille', () => {
    const result = validateVideoFile({ mimeType: 'video/mp4', sizeBytes: 0, durationMs: 5000 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/invalide/i);
  });

  it('rejette une vidéo de plus de 50 Mo', () => {
    const result = validateVideoFile({ mimeType: 'video/mp4', sizeBytes: 50 * 1024 * 1024 + 1, durationMs: 5000 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/50 Mo/);
  });

  it('rejette une vidéo de plus de 60 secondes', () => {
    const result = validateVideoFile({ mimeType: 'video/mp4', sizeBytes: 1000, durationMs: 60_001 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/60 secondes/);
  });

  it('rejette quand la taille ou la durée sont indisponibles (null)', () => {
    const resultNoSize = validateVideoFile({ mimeType: 'video/mp4', sizeBytes: null, durationMs: 5000 });
    expect(resultNoSize.ok).toBe(false);
    if (!resultNoSize.ok) expect(resultNoSize.error).toMatch(/indisponibles/i);

    const resultNoDuration = validateVideoFile({ mimeType: 'video/mp4', sizeBytes: 1000, durationMs: null });
    expect(resultNoDuration.ok).toBe(false);
    if (!resultNoDuration.ok) expect(resultNoDuration.error).toMatch(/indisponibles/i);
  });

  it('accepte un MP4 valide jusqu’à 50 Mo et 60 secondes', () => {
    expect(validateVideoFile({ mimeType: 'video/mp4', sizeBytes: 50 * 1024 * 1024, durationMs: 60_000 }).ok).toBe(true);
    expect(validateVideoFile({ mimeType: 'video/mp4', sizeBytes: 1, durationMs: 1 }).ok).toBe(true);
  });
});

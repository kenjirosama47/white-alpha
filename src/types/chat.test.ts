import { MESSAGE_MAX_LENGTH, validateImageFile, validateMessageContent, validateSearchQuery } from '@/types/chat';

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

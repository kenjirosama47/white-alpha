import { MESSAGE_MAX_LENGTH, validateMessageContent, validateSearchQuery } from '@/types/chat';

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

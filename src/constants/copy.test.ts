import {
  EMPTY_CONVERSATIONS_COPY,
  LOGIN_COPY,
  REGISTER_COPY,
  SECURITY_COPY,
  WELCOME_COPY,
} from '@/constants/copy';

describe('Textes officiels White Alpha (Phase 7.2)', () => {
  it('accueil', () => {
    expect(WELCOME_COPY.title).toBe('Bienvenue dans White Alpha');
    expect(WELCOME_COPY.subtitle).toBe('La meute privée. Vos échanges restent entre vous.');
  });

  it('connexion', () => {
    expect(LOGIN_COPY.title).toBe('Retrouvez la meute');
  });

  it('inscription', () => {
    expect(REGISTER_COPY.title).toBe('Rejoignez la meute White Alpha');
  });

  it('aucune conversation', () => {
    expect(EMPTY_CONVERSATIONS_COPY.title).toBe('La meute est encore silencieuse');
    expect(EMPTY_CONVERSATIONS_COPY.description).toBe('Commencez une conversation privée');
  });

  it('sécurité', () => {
    expect(SECURITY_COPY.title).toBe('Votre espace reste protégé');
  });

  it('aucun texte ne mentionne Claude', () => {
    const allText = [
      WELCOME_COPY.title,
      WELCOME_COPY.subtitle,
      LOGIN_COPY.title,
      REGISTER_COPY.title,
      EMPTY_CONVERSATIONS_COPY.title,
      EMPTY_CONVERSATIONS_COPY.description,
      SECURITY_COPY.title,
    ].join(' ');
    expect(allText).not.toMatch(/claude/i);
  });
});

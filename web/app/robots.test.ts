import robots from './robots';

describe('robots.txt (Phase 8.2)', () => {
  it('interdit totalement le crawl (application privée, jamais de référencement)', () => {
    const result = robots();

    expect(result.rules).toEqual({ userAgent: '*', disallow: '/' });
  });
});

import manifest from './manifest';

describe('manifest.webmanifest (Phase 8.2)', () => {
  it('déclare le nom, le mode standalone et l’URL de démarrage', () => {
    const result = manifest();

    expect(result.name).toBe('White Alpha');
    expect(result.short_name).toBe('White Alpha');
    expect(result.display).toBe('standalone');
    expect(result.start_url).toBe('/');
  });

  it('déclare au moins une icône 192x192, une 512x512 et une maskable', () => {
    const result = manifest();
    const icons = result.icons ?? [];

    expect(icons.some((icon) => icon.sizes === '192x192')).toBe(true);
    expect(icons.some((icon) => icon.sizes === '512x512' && icon.purpose === 'any')).toBe(true);
    expect(icons.some((icon) => icon.purpose === 'maskable')).toBe(true);
  });

  it('theme_color et background_color correspondent au noir profond White Alpha', () => {
    const result = manifest();

    expect(result.theme_color).toBe('#0D0F0C');
    expect(result.background_color).toBe('#0D0F0C');
  });
});

jest.mock('@/components/ServiceWorkerRegistration', () => ({
  ServiceWorkerRegistration: () => null,
}));

describe('app/layout — métadonnées globales (Phase 8.2)', () => {
  it('pose noindex/nofollow (application privée, jamais de référencement public)', async () => {
    const { metadata } = await import('./layout');

    expect(metadata.robots).toMatchObject({ index: false, follow: false });
  });

  it('déclare le manifest et les icônes Apple (installation iPhone)', async () => {
    const { metadata } = await import('./layout');

    expect(metadata.manifest).toBe('/manifest.webmanifest');
    expect(metadata.appleWebApp).toMatchObject({ capable: true });
  });
});

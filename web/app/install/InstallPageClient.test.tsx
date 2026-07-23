import { render, screen } from '@testing-library/react';

import { InstallPageClient } from './InstallPageClient';

const ANDROID_UA =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36';
const IPHONE_SAFARI_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/604.1';
const IPHONE_CHROME_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/125.0.0.0 Mobile/15E148 Safari/604.1';
const INSTAGRAM_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 302.0.0.0';

function mockNavigatorAndMedia(userAgent: string, standalone = false) {
  Object.defineProperty(window.navigator, 'userAgent', { value: userAgent, configurable: true });
  Object.defineProperty(window.navigator, 'maxTouchPoints', { value: 0, configurable: true });
  window.matchMedia = jest.fn().mockReturnValue({ matches: standalone });
}

const EMPTY_APK_META = { version: null, sizeBytes: null, sha256: null };

describe('InstallPageClient (Phase 8.7)', () => {
  afterEach(() => {
    // @ts-expect-error -- nettoyage du mock posé par matchMedia dans chaque test
    delete window.matchMedia;
  });

  it('met en avant la carte Android sur un appareil Android', async () => {
    mockNavigatorAndMedia(ANDROID_UA);

    render(<InstallPageClient androidApkUrl={null} androidApkMeta={EMPTY_APK_META} />);

    const badge = await screen.findByText('Recommandé pour ton appareil');
    expect(badge.closest('section')?.textContent).toContain('Installer sur Android');
  });

  it('met en avant la carte iPhone/iPad sur un appareil iOS', async () => {
    mockNavigatorAndMedia(IPHONE_SAFARI_UA);

    render(<InstallPageClient androidApkUrl={null} androidApkMeta={EMPTY_APK_META} />);

    const badge = await screen.findByText('Recommandé pour ton appareil');
    expect(badge.closest('section')?.textContent).toContain('Installer sur iPhone / iPad');
  });

  it('avertit quand le lien est ouvert dans Chrome sur iOS (Safari requis pour installer)', async () => {
    mockNavigatorAndMedia(IPHONE_CHROME_UA);

    render(<InstallPageClient androidApkUrl={null} androidApkMeta={EMPTY_APK_META} />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Safari');
  });

  it('avertit quand le lien est ouvert dans un navigateur intégré (Instagram)', async () => {
    mockNavigatorAndMedia(INSTAGRAM_UA);

    render(<InstallPageClient androidApkUrl={null} androidApkMeta={EMPTY_APK_META} />);

    expect(await screen.findByRole('alert')).toHaveTextContent('application');
  });

  it('affiche le statut "déjà installée" en mode standalone (délégué à chaque guide)', async () => {
    mockNavigatorAndMedia(ANDROID_UA, true);

    render(<InstallPageClient androidApkUrl={null} androidApkMeta={EMPTY_APK_META} />);

    const statuses = await screen.findAllByRole('status');
    expect(statuses.length).toBeGreaterThan(0);
    for (const status of statuses) {
      expect(status).toHaveTextContent('déjà installée');
    }
  });

  it('propose le lien "Continuer dans le navigateur" vers /login', async () => {
    mockNavigatorAndMedia(ANDROID_UA);

    render(<InstallPageClient androidApkUrl={null} androidApkMeta={EMPTY_APK_META} />);

    const link = await screen.findByText('Continuer dans le navigateur');
    expect(link.getAttribute('href')).toBe('/login');
  });

  it("n'affiche jamais de section de téléchargement APK tant que androidApkUrl est null", async () => {
    mockNavigatorAndMedia(ANDROID_UA);

    render(<InstallPageClient androidApkUrl={null} androidApkMeta={EMPTY_APK_META} />);

    expect(screen.queryByText(/Télécharger White Alpha pour Android/)).toBeNull();
  });

  it('affiche le bouton de téléchargement APK et ses métadonnées quand androidApkUrl est fourni', async () => {
    mockNavigatorAndMedia(ANDROID_UA);

    render(
      <InstallPageClient
        androidApkUrl="https://exemple-prive.test/whitealpha.apk"
        androidApkMeta={{ version: '1.0.4', sizeBytes: 106703741, sha256: 'abc123' }}
      />,
    );

    const downloadLink = await screen.findByText('Télécharger White Alpha pour Android');
    expect(downloadLink.getAttribute('href')).toBe('https://exemple-prive.test/whitealpha.apk');
    expect(await screen.findByText('1.0.4')).toBeTruthy();
    expect(await screen.findByText('abc123')).toBeTruthy();
  });
});

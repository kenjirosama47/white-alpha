import { render, screen } from '@testing-library/react';

import { InstallIOSGuide } from './InstallIOSGuide';
import { INSTALL_IOS_COPY } from '@/lib/copy';

describe('InstallIOSGuide (Phase 8.2)', () => {
  afterEach(() => {
    // @ts-expect-error -- nettoyage du mock posé par matchMedia dans chaque test
    delete window.matchMedia;
  });

  it("affiche le guide d'installation quand la PWA n'est pas installée", async () => {
    window.matchMedia = jest.fn().mockReturnValue({ matches: false });

    render(<InstallIOSGuide />);

    for (const step of INSTALL_IOS_COPY.steps) {
      expect(await screen.findByText(step)).toBeTruthy();
    }
  });

  it('masque le guide et confirme l’installation quand la PWA est déjà en mode standalone', async () => {
    window.matchMedia = jest.fn().mockReturnValue({ matches: true });

    render(<InstallIOSGuide />);

    expect(await screen.findByRole('status')).toHaveTextContent('déjà installée');
  });
});

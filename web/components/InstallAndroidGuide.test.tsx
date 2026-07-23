import { act, fireEvent, render, screen } from '@testing-library/react';

import { InstallAndroidGuide } from './InstallAndroidGuide';

function mockMatchMedia(matches: boolean) {
  window.matchMedia = jest.fn().mockReturnValue({ matches });
}

function dispatchBeforeInstallPrompt(overrides: Partial<{ prompt: jest.Mock; userChoice: Promise<{ outcome: string }> }> = {}) {
  const event = new Event('beforeinstallprompt', { cancelable: true }) as Event & Record<string, unknown>;
  event.prompt = overrides.prompt ?? jest.fn();
  event.userChoice = overrides.userChoice ?? Promise.resolve({ outcome: 'accepted' });
  window.dispatchEvent(event);
  return event;
}

describe('InstallAndroidGuide (Phase 8.7)', () => {
  afterEach(() => {
    // @ts-expect-error -- nettoyage du mock posé par matchMedia dans chaque test
    delete window.matchMedia;
  });

  it('confirme que White Alpha est déjà installée en mode standalone, sans jamais écouter beforeinstallprompt', async () => {
    mockMatchMedia(true);

    render(<InstallAndroidGuide />);

    expect(await screen.findByRole('status')).toHaveTextContent('déjà installée');
  });

  it("affiche les instructions manuelles quand beforeinstallprompt n'a jamais été déclenché", async () => {
    mockMatchMedia(false);

    render(<InstallAndroidGuide />);

    expect(await screen.findByText(/Menu ⋮|menu ⋮/)).toBeTruthy();
  });

  it('affiche un bouton « Installer White Alpha » quand beforeinstallprompt est capté', async () => {
    mockMatchMedia(false);
    render(<InstallAndroidGuide />);

    dispatchBeforeInstallPrompt();

    expect(await screen.findByRole('button', { name: 'Installer White Alpha' })).toBeTruthy();
  });

  it('déclenche prompt() et affiche un message si l’utilisateur refuse, avec repli vers les instructions manuelles', async () => {
    mockMatchMedia(false);
    const prompt = jest.fn().mockResolvedValue(undefined);
    render(<InstallAndroidGuide />);

    dispatchBeforeInstallPrompt({ prompt, userChoice: Promise.resolve({ outcome: 'dismissed' }) });
    const button = await screen.findByRole('button', { name: 'Installer White Alpha' });
    fireEvent.click(button);

    expect(prompt).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole('status')).toHaveTextContent('Installation annulée');
  });

  it('confirme l’installation immédiatement sur l’événement appinstalled', async () => {
    mockMatchMedia(false);
    render(<InstallAndroidGuide />);

    dispatchBeforeInstallPrompt();
    await screen.findByRole('button', { name: 'Installer White Alpha' });

    act(() => {
      window.dispatchEvent(new Event('appinstalled'));
    });

    expect(await screen.findByRole('status')).toHaveTextContent('déjà installée');
  });
});

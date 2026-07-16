import { render, screen } from '@testing-library/react-native';

import { AppLoadingState } from '@/components/app-loading-state';

describe('AppLoadingState', () => {
  it("n'affiche jamais un écran blanc : un indicateur est toujours présent", async () => {
    await render(<AppLoadingState />);

    expect(screen.getByLabelText('Chargement en cours')).toBeTruthy();
  });

  it('affiche un titre et une description optionnels', async () => {
    await render(<AppLoadingState title="Chargement des messages" description="Un instant..." />);

    expect(screen.getByText('Chargement des messages')).toBeTruthy();
    expect(screen.getByText('Un instant...')).toBeTruthy();
  });

  it('utilise le titre comme accessibilityLabel par défaut, annoncé aux lecteurs d’écran', async () => {
    await render(<AppLoadingState title="Chargement des conversations" />);

    const region = screen.getByLabelText('Chargement des conversations');
    expect(region.props.accessibilityRole).toBe('progressbar');
  });

  it('accepte un accessibilityLabel explicite distinct du titre affiché', async () => {
    await render(<AppLoadingState title="Chargement" accessibilityLabel="Chargement des messages en cours" />);

    expect(screen.getByLabelText('Chargement des messages en cours')).toBeTruthy();
  });
});

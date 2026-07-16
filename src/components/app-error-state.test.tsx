import { fireEvent, render, screen } from '@testing-library/react-native';

import { AppErrorState } from '@/components/app-error-state';

describe('AppErrorState', () => {
  it('affiche le message français fourni (jamais un détail technique brut)', async () => {
    await render(<AppErrorState description="Impossible de charger les conversations pour le moment." />);

    expect(screen.getByText('Impossible de charger les conversations pour le moment.')).toBeTruthy();
  });

  it('affiche « Réessayer » et appelle onRetry quand l’opération est récupérable', async () => {
    const onRetry = jest.fn();
    await render(<AppErrorState description="Erreur réseau." onRetry={onRetry} />);

    fireEvent.press(screen.getByText('Réessayer'));

    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("n'affiche aucun bouton pour une erreur non récupérable (onRetry omis)", async () => {
    await render(<AppErrorState description="Aucun utilisateur trouvé avec ce pseudo." />);

    expect(screen.queryByText('Réessayer')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('accepte un libellé de bouton personnalisé', async () => {
    await render(<AppErrorState description="Session expirée." onRetry={jest.fn()} retryLabel="Se reconnecter" />);

    expect(screen.getByText('Se reconnecter')).toBeTruthy();
  });
});

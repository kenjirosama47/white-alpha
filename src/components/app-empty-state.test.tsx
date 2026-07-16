import { fireEvent, render, screen } from '@testing-library/react-native';

import { AppEmptyState } from '@/components/app-empty-state';

describe('AppEmptyState', () => {
  it('affiche le titre et la description', async () => {
    await render(
      <AppEmptyState title="Aucune conversation" description="Recherchez un utilisateur pour commencer à discuter." />,
    );

    expect(screen.getByText('Aucune conversation')).toBeTruthy();
    expect(screen.getByText('Recherchez un utilisateur pour commencer à discuter.')).toBeTruthy();
  });

  it("n'affiche aucun bouton d'action quand aucune n'est fournie", async () => {
    await render(<AppEmptyState title="Aucun utilisateur trouvé" />);

    expect(screen.queryByRole('button')).toBeNull();
  });

  it("affiche un bouton d'action et l'appelle au tap quand fourni", async () => {
    const onAction = jest.fn();
    await render(<AppEmptyState title="Aucune conversation" actionLabel="Nouvelle discussion" onAction={onAction} />);

    fireEvent.press(screen.getByText('Nouvelle discussion'));

    expect(onAction).toHaveBeenCalledTimes(1);
  });
});

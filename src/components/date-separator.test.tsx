import { render, screen } from '@testing-library/react-native';

import { DateSeparator } from '@/components/date-separator';

describe('DateSeparator', () => {
  it('affiche le libellé fourni', async () => {
    await render(<DateSeparator label="Aujourd'hui" />);

    expect(screen.getByText("Aujourd'hui")).toBeTruthy();
  });

  it('est annoncé aux lecteurs d’écran', async () => {
    await render(<DateSeparator label="Hier" />);

    expect(screen.getByLabelText('Hier')).toBeTruthy();
  });
});

import { act, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { AppearanceProvider, useAppearanceContext } from '@/contexts/appearance-context';
import { DEFAULT_APPEARANCE_PREFERENCES } from '@/constants/appearance';
import { getAppearancePreferences, saveAppearancePreferences } from '@/lib/appearance-storage';

jest.mock('@/lib/appearance-storage', () => ({
  getAppearancePreferences: jest.fn(),
  saveAppearancePreferences: jest.fn(),
  resetAppearancePreferences: jest.fn(),
}));

function ScreenA() {
  const { preferences, updatePreferences } = useAppearanceContext();
  return (
    <Text testID="a-theme" onPress={() => updatePreferences({ themeMode: 'dark' })}>
      {preferences.themeMode}
    </Text>
  );
}

function ScreenB() {
  const { preferences } = useAppearanceContext();
  return <Text testID="b-theme">{preferences.themeMode}</Text>;
}

describe('AppearanceProvider / useAppearanceContext', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getAppearancePreferences as jest.Mock).mockResolvedValue(DEFAULT_APPEARANCE_PREFERENCES);
    (saveAppearancePreferences as jest.Mock).mockResolvedValue(undefined);
  });

  it('une seule instance partagee : une mise a jour sur un ecran se reflete immediatement sur un autre', async () => {
    await act(async () => {
      render(
        <AppearanceProvider>
          <ScreenA />
          <ScreenB />
        </AppearanceProvider>,
      );
      await Promise.resolve();
    });

    expect(screen.getByTestId('a-theme').props.children).toBe('system');
    expect(screen.getByTestId('b-theme').props.children).toBe('system');

    await act(async () => {
      screen.getByTestId('a-theme').props.onPress();
      await Promise.resolve();
    });

    expect(screen.getByTestId('a-theme').props.children).toBe('dark');
    expect(screen.getByTestId('b-theme').props.children).toBe('dark');
  });
});

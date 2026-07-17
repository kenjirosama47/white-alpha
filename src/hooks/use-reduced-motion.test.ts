import { renderHook } from '@testing-library/react-native';

import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { useReducedMotion as useReanimatedReducedMotion } from 'react-native-reanimated';

// Le module réel react-native-reanimated ne se charge pas dans cet
// environnement Jest (voir jest.setup.js) : ce test remplace uniquement
// useReducedMotion par un mock contrôlable, sans dépendre du vrai module.
jest.mock('react-native-reanimated', () => ({
  __esModule: true,
  useReducedMotion: jest.fn(),
}));

const mockReanimated = useReanimatedReducedMotion as jest.Mock;

describe('useReducedMotion', () => {
  it('reflète false quand le réglage système « Réduire les animations » est désactivé', async () => {
    mockReanimated.mockReturnValue(false);
    const { result } = await renderHook(() => useReducedMotion());

    expect(result.current).toBe(false);
  });

  it('reflète true quand le réglage système « Réduire les animations » est activé', async () => {
    mockReanimated.mockReturnValue(true);
    const { result } = await renderHook(() => useReducedMotion());

    expect(result.current).toBe(true);
  });
});

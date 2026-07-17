import { useReducedMotion as useReanimatedReducedMotion } from 'react-native-reanimated';

/**
 * Reflète le réglage système « Réduire les animations » (Android/iOS),
 * réactif aux changements en cours de session. Point d'import unique pour
 * toute l'application (Phase 7.6) : chaque animation `entering`/`exiting`
 * doit passer par ce hook plutôt que d'appeler directement
 * `react-native-reanimated`, pour rester testable et cohérente.
 */
export function useReducedMotion(): boolean {
  return useReanimatedReducedMotion();
}

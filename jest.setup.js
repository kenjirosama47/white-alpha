// Requis par React 19 + react-test-renderer pour que les mises à jour d'état
// asynchrones (promesses résolues après le premier rendu) soient reconnues
// comme faisant partie de l'environnement de test act().
global.IS_REACT_ACT_ENVIRONMENT = true;

// Mock global : le module natif @react-native-community/netinfo n'existe pas
// dans l'environnement de test (jsdom/react-test-renderer) et plante sinon
// dès qu'un composant/hook utilisant useNetworkStatus est rendu (Phase 5.2).
// Par défaut, connecté : les tests qui veulent simuler une coupure réseau
// surchargent `addEventListener` via `jest.mock(...)` dans leur propre fichier.
jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: {
    addEventListener: jest.fn(() => () => {}),
    fetch: jest.fn(() => Promise.resolve({ isConnected: true, isInternetReachable: true })),
  },
}));

// Mock global minimal de react-native-reanimated (Phase 7.3) : le module
// réel — et même son propre mock officiel (`react-native-reanimated/mock`)
// — plante au chargement dans cet environnement Jest (aucun binding natif
// react-native-worklets disponible, y compris via le mock fourni par la
// bibliothèque ; voir l'échec initial documenté dans
// welcome-screen.test.tsx, déjà contourné là par un mock ciblé
// d'AnimatedIcon). Fournit uniquement ce dont l'application se sert
// réellement (`Animated.View`, `FadeIn.duration()`, `Keyframe`) sans aucune
// animation réelle : les tests ne portent jamais sur le rendu de
// l'animation elle-même, seulement sur le contenu final.
jest.mock('react-native-reanimated', () => {
  const { View } = require('react-native');
  const chainable = () => {
    const api = { duration: () => api, easing: () => api, withCallback: () => api };
    return api;
  };
  return {
    __esModule: true,
    default: { View, Text: View, Image: View, ScrollView: View },
    View,
    FadeIn: chainable(),
    FadeOut: chainable(),
    Easing: { elastic: () => (t) => t },
    Keyframe: class {
      duration() {
        return this;
      }
    },
    // Par défaut, réglage système non réduit : les tests qui veulent
    // simuler « Réduire les animations » activé surchargent via
    // jest.mock('@/hooks/use-reduced-motion', ...) dans leur propre fichier
    // (voir welcome-screen.test.tsx, Phase 7.6).
    useReducedMotion: () => false,
  };
});

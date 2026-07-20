import { randomUUID } from 'node:crypto';

import '@testing-library/jest-dom';

// jsdom n'implémente pas URL.createObjectURL/revokeObjectURL (lacune
// documentée) — nécessaire pour les aperçus locaux de pièces jointes
// (Phase 8.5.3). Mock minimal global : suffisant pour tous les tests qui en
// ont besoin, sans effet sur ceux qui ne les appellent jamais.
if (typeof URL.createObjectURL !== 'function') {
  URL.createObjectURL = jest.fn(() => 'blob:mock-url');
}
if (typeof URL.revokeObjectURL !== 'function') {
  URL.revokeObjectURL = jest.fn();
}

// jest-environment-jsdom fournit son propre `crypto` (Web Crypto,
// getRandomValues) sans `randomUUID` — à la différence de l'environnement
// Node réel utilisé par les tests de routes (`@jest-environment node`).
// Complété ici avec l'implémentation Node réelle, jamais une valeur fixe.
if (typeof globalThis.crypto?.randomUUID !== 'function') {
  Object.defineProperty(globalThis.crypto, 'randomUUID', { value: randomUUID, configurable: true });
}

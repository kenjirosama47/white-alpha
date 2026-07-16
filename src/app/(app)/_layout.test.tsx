import { render, screen } from '@testing-library/react-native';

import AppLayout from '@/app/(app)/_layout';

// La protection contre les utilisateurs non authentifiés vient du
// Stack.Protected guard={isAuthenticated} du layout racine
// (src/app/_layout.tsx), appliqué à TOUT le groupe (app) — pas d'une
// redirection propre à chaque écran. Ce test vérifie donc que /profile est
// bien déclaré à l'intérieur de ce même groupe, aux côtés des autres écrans
// déjà protégés (index, search, conversation/[id]) : suffisant pour garantir
// qu'un utilisateur non authentifié est redirigé vers (auth) avant même
// d'atteindre /profile, sans dupliquer le test du mécanisme Stack.Protected
// lui-même (primitive Expo Router, pas une logique propre à cette app).
jest.mock('expo-router', () => {
  const ReactActual = jest.requireActual('react');
  const { Text: RNText } = jest.requireActual('react-native');
  return {
    Stack: Object.assign(
      ({ children }: { children: React.ReactNode }) => ReactActual.createElement(ReactActual.Fragment, null, children),
      {
        Screen: ({ name }: { name: string }) => ReactActual.createElement(RNText, null, name),
      },
    ),
  };
});

describe('AppLayout (groupe (app))', () => {
  it('déclare index, search, profile et conversation/[id], tous dans le même groupe protégé', async () => {
    await render(<AppLayout />);

    expect(screen.getByText('index')).toBeTruthy();
    expect(screen.getByText('search')).toBeTruthy();
    expect(screen.getByText('profile')).toBeTruthy();
    expect(screen.getByText('conversation/[id]')).toBeTruthy();
  });
});

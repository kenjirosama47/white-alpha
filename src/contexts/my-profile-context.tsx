import { createContext, useContext, type PropsWithChildren } from 'react';

import { useMyProfile } from '@/hooks/use-my-profile';
import type { MyProfile } from '@/services/profiles';

type MyProfileContextValue = {
  profile: MyProfile | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => void;
  setProfile: (profile: MyProfile) => void;
};

const MyProfileContext = createContext<MyProfileContextValue | null>(null);

/**
 * Une seule instance de `useMyProfile` partagée par tous les écrans du
 * groupe (app) (Anomalie 1, build 16) : avant cette correction, chaque écran
 * (Profil, galerie d'avatars, liste des conversations) appelait sa propre
 * instance de `useMyProfile`, avec son propre état local indépendant. Un
 * enregistrement réussi sur un écran (ex. galerie d'avatars) mettait à jour
 * l'état de CET écran uniquement — en revenant sur un autre écran déjà monté
 * (ex. Profil), rien ne déclenchait de nouveau chargement (l'effet de
 * `useMyProfile` ne s'exécute qu'au montage), et l'ancien avatar restait
 * affiché jusqu'à un redémarrage complet de l'application. Monter ce
 * Provider une seule fois, au-dessus de la pile de navigation du groupe
 * (app), garantit qu'un `setProfile` réussi sur n'importe quel écran se
 * reflète immédiatement partout ailleurs.
 */
export function MyProfileProvider({ children }: PropsWithChildren) {
  const value = useMyProfile();
  return <MyProfileContext.Provider value={value}>{children}</MyProfileContext.Provider>;
}

export function useMyProfileContext(): MyProfileContextValue {
  const context = useContext(MyProfileContext);
  if (!context) {
    throw new Error('useMyProfileContext doit être utilisé à l’intérieur de MyProfileProvider.');
  }
  return context;
}

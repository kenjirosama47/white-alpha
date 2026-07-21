import { Stack } from 'expo-router';

import { MyProfileProvider } from '@/contexts/my-profile-context';

// L'accès à ce groupe est déjà conditionné par Stack.Protected dans
// src/app/_layout.tsx : ce layout n'a pas besoin de revérifier la session.
// MyProfileProvider monté ici une seule fois (Anomalie 1, build 16) : tous
// les écrans du groupe partagent la même instance de profil, pour qu'une
// modification (avatar, nom...) sur un écran se reflète immédiatement sur
// tous les autres, sans redémarrage.
export default function AppLayout() {
  return (
    <MyProfileProvider>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="search" />
        <Stack.Screen name="profile" />
        <Stack.Screen name="avatar-gallery" />
        <Stack.Screen name="notifications" />
        <Stack.Screen name="appearance" />
        <Stack.Screen name="conversation/[id]" />
      </Stack>
    </MyProfileProvider>
  );
}

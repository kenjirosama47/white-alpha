import { Stack } from 'expo-router';

// L'accès à ce groupe est déjà conditionné par Stack.Protected dans
// src/app/_layout.tsx : ce layout n'a pas besoin de revérifier la session.
export default function AppLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="search" />
      <Stack.Screen name="profile" />
      <Stack.Screen name="avatar-gallery" />
      <Stack.Screen name="notifications" />
      <Stack.Screen name="conversation/[id]" />
    </Stack>
  );
}

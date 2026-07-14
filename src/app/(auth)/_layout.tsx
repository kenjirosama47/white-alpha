import { Stack } from 'expo-router';

// L'accès à ce groupe est déjà conditionné par Stack.Protected dans
// src/app/_layout.tsx : ce layout n'a pas besoin de revérifier la session.
export default function AuthLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="login" />
      <Stack.Screen name="register" />
    </Stack>
  );
}

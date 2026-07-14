import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useAuth } from '@/contexts/auth-context';

// Placeholder Phase 1 : conversations, recherche d'utilisateur et écran
// Assistant Claude arrivent en phases ultérieures (voir PLAN.md).
export default function HomeScreen() {
  const { signOut } = useAuth();
  const [submitting, setSubmitting] = useState(false);

  async function handleSignOut() {
    if (submitting) return;
    setSubmitting(true);
    await signOut();
    setSubmitting(false);
    router.replace('/');
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedText type="subtitle">Connecté</ThemedText>
        <ThemedText themeColor="textSecondary" style={styles.text}>
          Les conversations arriveront dans une phase suivante.
        </ThemedText>

        <Pressable
          onPress={handleSignOut}
          disabled={submitting}
          style={({ pressed }) => [styles.buttonSecondary, (pressed || submitting) && styles.pressed]}>
          <ThemedText type="smallBold">{submitting ? 'Déconnexion...' : 'Se déconnecter'}</ThemedText>
        </Pressable>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    flexDirection: 'row',
  },
  safeArea: {
    flex: 1,
    paddingHorizontal: Spacing.four,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.four,
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    width: '100%',
  },
  text: {
    textAlign: 'center',
  },
  buttonSecondary: {
    borderRadius: Spacing.three,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.five,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#60646C',
  },
  pressed: {
    opacity: 0.7,
  },
});

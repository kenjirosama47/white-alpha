import { Link } from 'expo-router';
import { Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AnimatedIcon } from '@/components/animated-icon';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';

export default function WelcomeScreen() {
  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedView style={styles.heroSection}>
          <AnimatedIcon />
          <ThemedText type="title" style={styles.title}>
            Discussion{'\n'}Privée Claude
          </ThemedText>
          <ThemedText themeColor="textSecondary" style={styles.subtitle}>
            Messagerie privée entre deux personnes.
          </ThemedText>
        </ThemedView>

        <ThemedView style={styles.actions}>
          <Link href="/login" asChild>
            <Pressable style={({ pressed }) => [styles.buttonPrimary, pressed && styles.pressed]}>
              <ThemedText type="smallBold" style={styles.buttonPrimaryLabel}>
                Se connecter
              </ThemedText>
            </Pressable>
          </Link>
          <Link href="/register" asChild>
            <Pressable
              style={({ pressed }) => [styles.buttonSecondary, pressed && styles.pressed]}>
              <ThemedText type="smallBold">Créer un compte</ThemedText>
            </Pressable>
          </Link>
        </ThemedView>
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
    gap: Spacing.six,
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    width: '100%',
  },
  heroSection: {
    alignItems: 'center',
    gap: Spacing.three,
  },
  title: {
    textAlign: 'center',
  },
  subtitle: {
    textAlign: 'center',
  },
  actions: {
    alignSelf: 'stretch',
    gap: Spacing.three,
  },
  buttonPrimary: {
    backgroundColor: '#208AEF',
    borderRadius: Spacing.three,
    paddingVertical: Spacing.three,
    alignItems: 'center',
  },
  buttonPrimaryLabel: {
    color: '#ffffff',
  },
  buttonSecondary: {
    borderRadius: Spacing.three,
    paddingVertical: Spacing.three,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#60646C',
  },
  pressed: {
    opacity: 0.7,
  },
});

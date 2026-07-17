import { Link } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AnimatedIcon } from '@/components/animated-icon';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';

export default function WelcomeScreen() {
  const [primaryPressed, setPrimaryPressed] = useState(false);
  const [secondaryPressed, setSecondaryPressed] = useState(false);

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
            {/* Style ni fonction ni tableau ici, obligatoirement : <Link
                asChild> délègue la fusion des props à @radix-ui/react-slot
                (expo-router ui/Slot.js), qui fusionne `style` par spread
                d'objet (`{...style}`) et rejette explicitement (throw en
                dev, échec silencieux en prod) tout style qui n'est pas un
                objet déjà aplati : une fonction spreadée perd toutes ses
                propriétés (aucune propriété propre énumérable), un tableau
                spreadé devient {0: ..., 1: ...} au lieu d'un style valide.
                D'où StyleSheet.flatten(...) appelé directement (jamais dans
                un callback) et l'état pressed géré manuellement. */}
            <Pressable
              onPressIn={() => setPrimaryPressed(true)}
              onPressOut={() => setPrimaryPressed(false)}
              style={StyleSheet.flatten([styles.buttonPrimary, primaryPressed && styles.buttonPrimaryPressed])}>
              <ThemedText type="smallBold" style={styles.buttonPrimaryLabel}>
                Se connecter
              </ThemedText>
            </Pressable>
          </Link>
          <Link href="/register" asChild>
            <Pressable
              onPressIn={() => setSecondaryPressed(true)}
              onPressOut={() => setSecondaryPressed(false)}
              style={StyleSheet.flatten([styles.buttonSecondary, secondaryPressed && styles.buttonSecondaryPressed])}>
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
  buttonPrimaryPressed: {
    opacity: 0.7,
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
  buttonSecondaryPressed: {
    opacity: 0.7,
  },
});

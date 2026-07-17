import { Link } from 'expo-router';
import { useState } from 'react';
import { Image, Pressable, StyleSheet } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Radius, Spacing, TouchTarget } from '@/constants/theme';
import { WELCOME_COPY } from '@/constants/copy';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { useTheme } from '@/hooks/use-theme';

const brandingIllustration = require('@/assets/images/white-alpha-wolf-branding.jpg');

export default function WelcomeScreen() {
  const theme = useTheme();
  const reduceMotion = useReducedMotion();
  const [primaryPressed, setPrimaryPressed] = useState(false);
  const [secondaryPressed, setSecondaryPressed] = useState(false);

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <Animated.View entering={reduceMotion ? undefined : FadeIn.duration(500)} style={styles.content}>
          <ThemedView style={styles.heroSection}>
            <Image
              source={brandingIllustration}
              style={styles.illustration}
              accessibilityIgnoresInvertColors
              accessibilityLabel="Loup blanc White Alpha"
            />
            <ThemedText type="display" style={styles.title}>
              {WELCOME_COPY.title}
            </ThemedText>
            <ThemedText type="body" themeColor="textSecondary" style={styles.subtitle}>
              {WELCOME_COPY.subtitle}
            </ThemedText>
          </ThemedView>

          <ThemedView style={styles.actions}>
            {/* <Link asChild> délègue la fusion des props à @radix-ui/react-slot
                (expo-router ui/Slot.js), qui fusionne `style` par spread
                d'objet et rejette explicitement (throw en dev, échec
                silencieux en prod — fond/texte disparaissent) tout style qui
                n'est pas déjà un objet aplati : jamais de fonction ni de
                tableau ici (voir welcome-screen.test.tsx, garde-fou dédié).
                D'où StyleSheet.flatten(...) appelé directement et l'état
                pressed géré manuellement — le composant `Button` partagé
                (Phase 7.1) n'est volontairement pas utilisé sur ces deux
                boutons précis, son style interne étant une fonction. */}
            <Link href="/login" asChild>
              <Pressable
                onPressIn={() => setPrimaryPressed(true)}
                onPressOut={() => setPrimaryPressed(false)}
                style={StyleSheet.flatten([
                  styles.buttonPrimary,
                  { backgroundColor: theme.accent },
                  primaryPressed && styles.pressed,
                ])}>
                <ThemedText type="label" style={{ color: theme.onAccent }}>
                  Se connecter
                </ThemedText>
              </Pressable>
            </Link>
            <Link href="/register" asChild>
              <Pressable
                onPressIn={() => setSecondaryPressed(true)}
                onPressOut={() => setSecondaryPressed(false)}
                style={StyleSheet.flatten([
                  styles.buttonSecondary,
                  { borderColor: theme.border },
                  secondaryPressed && styles.pressed,
                ])}>
                <ThemedText type="label">Créer un compte</ThemedText>
              </Pressable>
            </Link>
          </ThemedView>
        </Animated.View>
      </SafeAreaView>
    </ThemedView>
  );
}

const ILLUSTRATION_SIZE = 152;

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
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    width: '100%',
  },
  content: {
    alignItems: 'center',
    gap: Spacing.six,
    width: '100%',
  },
  heroSection: {
    alignItems: 'center',
    gap: Spacing.three,
  },
  illustration: {
    width: ILLUSTRATION_SIZE,
    height: ILLUSTRATION_SIZE,
    borderRadius: ILLUSTRATION_SIZE / 2,
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
    borderRadius: Radius.md,
    minHeight: TouchTarget.comfortable,
    paddingVertical: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonSecondary: {
    borderRadius: Radius.md,
    minHeight: TouchTarget.comfortable,
    paddingVertical: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  pressed: {
    opacity: 0.7,
  },
});

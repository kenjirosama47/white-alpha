import { router } from 'expo-router';
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
              style={[styles.illustration, styles.illustrationCentered]}
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
            {/* Navigation directe via `router.push` (pas de <Link asChild>) :
                le mécanisme de fusion de props de Slot (expo-router
                ui/Slot.js) s'est révélé source de bugs de rendu réels en
                Release (texte tronqué constaté sur build 16, invisible en
                test Jest car aucune vraie mesure Yoga n'y est effectuée) —
                mêmes symptômes que le bug de style déjà documenté et corrigé
                en Phase 7.3. Un Pressable non enveloppé par Slot est le
                composant qu'utilisent déjà tous les autres écrans de l'app
                pour naviguer (voir profile.tsx, security.tsx). */}
            <Pressable
              onPress={() => router.push('/login')}
              onPressIn={() => setPrimaryPressed(true)}
              onPressOut={() => setPrimaryPressed(false)}
              accessibilityRole="button"
              accessibilityLabel="Se connecter"
              style={[styles.buttonPrimary, { backgroundColor: theme.accent }, primaryPressed && styles.pressed]}>
              <ThemedText type="label" style={[styles.buttonLabel, { color: theme.onAccent }]}>
                Se connecter
              </ThemedText>
            </Pressable>
            <Pressable
              onPress={() => router.push('/register')}
              onPressIn={() => setSecondaryPressed(true)}
              onPressOut={() => setSecondaryPressed(false)}
              accessibilityRole="button"
              accessibilityLabel="Créer un compte"
              style={[styles.buttonSecondary, { borderColor: theme.border }, secondaryPressed && styles.pressed]}>
              <ThemedText type="label" style={styles.buttonLabel}>
                Créer un compte
              </ThemedText>
            </Pressable>
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
    // `alignItems: 'stretch'` (au lieu de 'center') : sur un parent flex
    // 'center', un enfant <Text> devient shrink-to-fit sur l'axe croisé —
    // nécessaire pour que le texte des boutons (Se connecter/Créer un
    // compte) ne soit pas mesuré avec une largeur ambiguë (bug réel constaté
    // et corrigé, build 16 : « Se »/« Créer un » au lieu du texte complet).
    alignItems: 'stretch',
    gap: Spacing.six,
    width: '100%',
  },
  heroSection: {
    alignItems: 'stretch',
    gap: Spacing.three,
  },
  illustration: {
    width: ILLUSTRATION_SIZE,
    height: ILLUSTRATION_SIZE,
    borderRadius: ILLUSTRATION_SIZE / 2,
  },
  illustrationCentered: {
    alignSelf: 'center',
  },
  title: {
    textAlign: 'center',
    alignSelf: 'stretch',
  },
  // `minHeight: 48` (2 × lineHeight de 24) : cause racine distincte,
  // identifiée par instrumentation directe (onLayout + console.log lus via
  // logcat sur APK Release réel, build 16) — Yoga mesure correctement la
  // largeur du sous-titre (stretch, ~363dp, identique à heroSection) mais
  // sous-évalue sa hauteur à une seule ligne (24dp) alors que le texte a
  // réellement besoin de 2 lignes à cette largeur ; le rendu natif Android
  // peint alors le texte jusqu'à épuisement de l'espace alloué, sans
  // ellipse (aucun numberOfLines n'est fixé). `numberOfLines`,
  // `ellipsizeMode`, `flexShrink`, `alignSelf`, `width: '100%'`,
  // `includeFontPadding`, `allowFontScaling`/`maxFontSizeMultiplier`,
  // ScrollView/KeyboardAvoidingView et la suppression de l'animation
  // d'entrée ont tous été testés isolément sur APK Release réel sans effet
  // sur ce texte précis : aucun n'influence la mesure de hauteur erronée.
  // Réservation explicite de l'espace vertical nécessaire, seule variable
  // dont dépend le résultat.
  subtitle: {
    textAlign: 'center',
    alignSelf: 'stretch',
    minHeight: 48,
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
  buttonLabel: {
    textAlign: 'center',
    alignSelf: 'stretch',
  },
});

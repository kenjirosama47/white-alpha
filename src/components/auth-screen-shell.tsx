import type { ReactNode } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  type ImageSourcePropType,
} from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';

type AuthScreenShellProps = {
  /** Illustration White Alpha (loup) affichée en partie haute — omise sur les écrans très denses (ex. MFA). */
  illustrationSource?: ImageSourcePropType;
  title: string;
  subtitle?: string;
  children: ReactNode;
  /** Action secondaire discrète en bas d'écran (ex. lien « Pas encore de compte ? »). */
  footer?: ReactNode;
  /** Bouton de retour explicite en haut d'écran — omis si absent (ex. écran d'accueil, aucun écran précédent pertinent). */
  onBack?: () => void;
};

/**
 * Structure commune aux écrans d'authentification (Phase 7.3) : illustration
 * White Alpha, titre, sous-titre, contenu scrollable avec clavier
 * correctement géré (aucune zone masquée), action secondaire, retour
 * optionnel. Apparition progressive légère du contenu (`FadeIn`, unique au
 * montage — jamais une animation permanente).
 */
export function AuthScreenShell({ illustrationSource, title, subtitle, children, footer, onBack }: AuthScreenShellProps) {
  return (
    <ThemedView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 24}>
        <SafeAreaView style={styles.safeArea}>
          {onBack && (
            <Pressable onPress={onBack} hitSlop={8} accessibilityRole="button" accessibilityLabel="Retour">
              <ThemedText type="link" themeColor="textSecondary">
                Retour
              </ThemedText>
            </Pressable>
          )}
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}>
            <Animated.View entering={FadeIn.duration(400)} style={styles.content}>
              {illustrationSource && (
                <Image source={illustrationSource} style={styles.illustration} accessibilityIgnoresInvertColors />
              )}
              <ThemedView style={styles.heading}>
                <ThemedText type="title" style={styles.centeredText}>
                  {title}
                </ThemedText>
                {subtitle && (
                  <ThemedText type="body" themeColor="textSecondary" style={styles.centeredText}>
                    {subtitle}
                  </ThemedText>
                )}
              </ThemedView>

              <ThemedView style={styles.body}>{children}</ThemedView>

              {footer && <ThemedView style={styles.footer}>{footer}</ThemedView>}
            </Animated.View>
          </ScrollView>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}

const ILLUSTRATION_SIZE = 160;

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    paddingHorizontal: Spacing.four,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    width: '100%',
    paddingVertical: Spacing.five,
  },
  content: {
    gap: Spacing.five,
    alignItems: 'stretch',
  },
  illustration: {
    width: ILLUSTRATION_SIZE,
    height: ILLUSTRATION_SIZE,
    borderRadius: ILLUSTRATION_SIZE / 2,
    alignSelf: 'center',
  },
  heading: {
    gap: Spacing.two,
  },
  centeredText: {
    textAlign: 'center',
  },
  body: {
    gap: Spacing.three,
  },
  footer: {
    alignItems: 'center',
    gap: Spacing.two,
  },
});

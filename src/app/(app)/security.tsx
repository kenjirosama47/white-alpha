import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppErrorState } from '@/components/app-error-state';
import { AppLoadingState } from '@/components/app-loading-state';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useAuth } from '@/contexts/auth-context';
import { useMfa } from '@/hooks/use-mfa';
import { useMyProfile } from '@/hooks/use-my-profile';
import { useTheme } from '@/hooks/use-theme';
import type { TotpEnrollment } from '@/lib/mfa';
import type { MyProfile } from '@/services/profiles';

export default function SecurityScreen() {
  const { profile, isLoading: profileLoading, error: profileError, refresh: refreshProfile } = useMyProfile();
  const mfa = useMfa();
  const { signOut } = useAuth();

  // Cohérence de l'état MFA : aal2 (session déjà vérifiée) sans aucun facteur
  // vérifié en base est un état impossible en usage normal (facteur désactivé
  // ailleurs entre-temps, incohérence de synchronisation). Ne jamais laisser
  // l'utilisateur continuer dans un état indéterminé : déconnexion immédiate.
  useEffect(() => {
    if (mfa.status && mfa.status.currentLevel === 'aal2' && mfa.status.verifiedFactors.length === 0) {
      signOut();
    }
  }, [mfa.status, signOut]);

  const isLoading = profileLoading || mfa.isLoading;
  const error = profileError ?? mfa.error;

  function retry() {
    refreshProfile();
    mfa.refresh();
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedView style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={8}>
            <ThemedText type="link" themeColor="textSecondary">
              Retour
            </ThemedText>
          </Pressable>
          <ThemedText type="subtitle">Sécurité</ThemedText>
          <ThemedView style={styles.headerSpacer} />
        </ThemedView>

        {isLoading ? (
          <AppLoadingState accessibilityLabel="Chargement de la sécurité du compte" />
        ) : error ? (
          <AppErrorState description={error} onRetry={retry} />
        ) : !profile ? (
          <AppErrorState description="Profil introuvable." onRetry={retry} />
        ) : (
          <SecurityContent profile={profile} mfa={mfa} />
        )}
      </SafeAreaView>
    </ThemedView>
  );
}

type SecurityContentProps = {
  profile: MyProfile;
  mfa: ReturnType<typeof useMfa>;
};

function SecurityContent({ profile, mfa }: SecurityContentProps) {
  const isOwner = profile.role === 'owner';

  return (
    <ScrollView contentContainerStyle={styles.scrollContent}>
      <ThemedView style={styles.block}>
        <ThemedText type="smallBold" themeColor="textSecondary">
          Statut de session
        </ThemedText>
        <ThemedView style={styles.row}>
          <ThemedText type="small" themeColor="textSecondary">
            Connexion
          </ThemedText>
          <ThemedText type="small">
            {mfa.status?.currentLevel === 'aal2' ? 'Connecté — vérifié (MFA)' : 'Connecté'}
          </ThemedText>
        </ThemedView>
        {isOwner && (
          <ThemedView style={styles.ownerBadge}>
            <ThemedText type="smallBold" style={styles.ownerBadgeText}>
              Propriétaire
            </ThemedText>
          </ThemedView>
        )}
      </ThemedView>

      {isOwner ? (
        <OwnerMfaSection mfa={mfa} />
      ) : (
        <ThemedView style={styles.block}>
          <ThemedText type="smallBold" themeColor="textSecondary">
            Authentification multifacteur
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Aucune option d&apos;administration sur ce compte. L&apos;activation de l&apos;authentification
            multifacteur sera bientôt disponible pour tous les comptes.
          </ThemedText>
        </ThemedView>
      )}
    </ScrollView>
  );
}

function OwnerMfaSection({ mfa }: { mfa: ReturnType<typeof useMfa> }) {
  const [justEnrolled, setJustEnrolled] = useState(false);
  const hasVerifiedFactor = (mfa.status?.verifiedFactors.length ?? 0) > 0;

  if (justEnrolled) {
    return (
      <ThemedView style={styles.block}>
        <ThemedText type="smallBold" themeColor="textSecondary">
          Authentification multifacteur
        </ThemedText>
        <ThemedText type="small" style={styles.success}>
          Authentification multifacteur activée.
        </ThemedText>
        <Pressable
          onPress={() => setJustEnrolled(false)}
          style={({ pressed }) => [styles.buttonPrimary, pressed && styles.pressed]}>
          <ThemedText type="smallBold" style={styles.buttonPrimaryLabel}>
            OK
          </ThemedText>
        </Pressable>
      </ThemedView>
    );
  }

  if (mfa.enrollment) {
    return (
      <EnrollmentFlow
        enrollment={mfa.enrollment}
        isVerifying={mfa.isVerifying}
        verifyError={mfa.verifyError}
        onVerify={async (code) => {
          const success = await mfa.confirmEnrollment(code);
          if (success) setJustEnrolled(true);
        }}
        onCancel={mfa.cancelEnrollment}
      />
    );
  }

  if (mfa.pendingDisableFactorId) {
    return (
      <DisableFlow
        isDisabling={mfa.isDisabling}
        disableError={mfa.disableError}
        onConfirm={mfa.confirmDisable}
        onCancel={mfa.cancelDisable}
      />
    );
  }

  return (
    <ThemedView style={styles.block}>
      <ThemedText type="smallBold" themeColor="textSecondary">
        Authentification multifacteur
      </ThemedText>
      <ThemedView style={styles.row}>
        <ThemedText type="small" themeColor="textSecondary">
          État
        </ThemedText>
        <ThemedText type="small">{hasVerifiedFactor ? 'Vérifié' : 'Non configuré'}</ThemedText>
      </ThemedView>
      {mfa.enrollmentError && (
        <ThemedText type="small" style={styles.error}>
          {mfa.enrollmentError}
        </ThemedText>
      )}
      {hasVerifiedFactor ? (
        <Pressable
          onPress={() => {
            const factorId = mfa.status?.verifiedFactors[0]?.id;
            if (factorId) mfa.startDisable(factorId);
          }}
          style={({ pressed }) => [styles.buttonDangerOutline, pressed && styles.pressed]}>
          <ThemedText type="smallBold" style={styles.error}>
            Désactiver
          </ThemedText>
        </Pressable>
      ) : (
        <Pressable
          onPress={mfa.startEnrollment}
          disabled={mfa.isStartingEnrollment}
          style={({ pressed }) => [
            styles.buttonPrimary,
            (pressed || mfa.isStartingEnrollment) && styles.pressed,
          ]}>
          <ThemedText type="smallBold" style={styles.buttonPrimaryLabel}>
            {mfa.isStartingEnrollment ? 'Préparation…' : 'Configurer l’authentification'}
          </ThemedText>
        </Pressable>
      )}
    </ThemedView>
  );
}

type EnrollmentFlowProps = {
  enrollment: TotpEnrollment;
  isVerifying: boolean;
  verifyError: string | null;
  onVerify: (code: string) => Promise<void>;
  onCancel: () => Promise<void>;
};

function EnrollmentFlow({ enrollment, isVerifying, verifyError, onVerify, onCancel }: EnrollmentFlowProps) {
  const theme = useTheme();
  const [code, setCode] = useState('');

  return (
    <ThemedView style={styles.block}>
      <ThemedText type="smallBold" themeColor="textSecondary">
        Configurer l&apos;authentification
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        Scanne ce code avec ton application d&apos;authentification (Google Authenticator, 1Password…), puis
        saisis le code à 6 chiffres généré.
      </ThemedText>

      <ThemedView style={styles.qrContainer}>
        <Image
          source={{ uri: enrollment.qrCodeDataUri }}
          style={styles.qrImage}
          accessibilityLabel="Code QR d'activation de l'authentification multifacteur"
        />
      </ThemedView>

      <ThemedText type="small" themeColor="textSecondary">
        Impossible de scanner ? Saisis ce code manuellement :
      </ThemedText>
      <ThemedText type="smallBold" selectable style={styles.secretText}>
        {enrollment.secret}
      </ThemedText>

      <TextInput
        value={code}
        onChangeText={setCode}
        editable={!isVerifying}
        keyboardType="number-pad"
        maxLength={6}
        placeholder="Code à 6 chiffres"
        style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
      />

      {verifyError && (
        <ThemedText type="small" style={styles.error}>
          {verifyError}
        </ThemedText>
      )}

      <Pressable
        onPress={() => onVerify(code)}
        disabled={isVerifying || code.length !== 6}
        style={({ pressed }) => [
          styles.buttonPrimary,
          (pressed || isVerifying || code.length !== 6) && styles.pressed,
        ]}>
        <ThemedText type="smallBold" style={styles.buttonPrimaryLabel}>
          {isVerifying ? 'Vérification…' : 'Vérifier'}
        </ThemedText>
      </Pressable>
      <Pressable onPress={() => onCancel()} disabled={isVerifying} hitSlop={8}>
        <ThemedText type="small" themeColor="textSecondary" style={styles.centeredText}>
          Annuler
        </ThemedText>
      </Pressable>
    </ThemedView>
  );
}

type DisableFlowProps = {
  isDisabling: boolean;
  disableError: string | null;
  onConfirm: (code: string) => Promise<boolean>;
  onCancel: () => void;
};

function DisableFlow({ isDisabling, disableError, onConfirm, onCancel }: DisableFlowProps) {
  const theme = useTheme();
  const [code, setCode] = useState('');

  return (
    <ThemedView style={styles.block}>
      <ThemedText type="smallBold" themeColor="textSecondary">
        Désactiver l&apos;authentification multifacteur
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        Pour confirmer la désactivation, saisis un nouveau code généré par ton application d&apos;authentification.
      </ThemedText>

      <TextInput
        value={code}
        onChangeText={setCode}
        editable={!isDisabling}
        keyboardType="number-pad"
        maxLength={6}
        placeholder="Code à 6 chiffres"
        style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
      />

      {disableError && (
        <ThemedText type="small" style={styles.error}>
          {disableError}
        </ThemedText>
      )}

      <Pressable
        onPress={() => onConfirm(code)}
        disabled={isDisabling || code.length !== 6}
        style={({ pressed }) => [
          styles.buttonDangerOutline,
          (pressed || isDisabling || code.length !== 6) && styles.pressed,
        ]}>
        <ThemedText type="smallBold" style={styles.error}>
          {isDisabling ? 'Désactivation…' : 'Confirmer la désactivation'}
        </ThemedText>
      </Pressable>
      <Pressable onPress={onCancel} disabled={isDisabling} hitSlop={8}>
        <ThemedText type="small" themeColor="textSecondary" style={styles.centeredText}>
          Annuler
        </ThemedText>
      </Pressable>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'row',
  },
  safeArea: {
    flex: 1,
    paddingHorizontal: Spacing.three,
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    width: '100%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Spacing.two,
    paddingBottom: Spacing.two,
  },
  headerSpacer: {
    width: 50,
  },
  scrollContent: {
    gap: Spacing.five,
    paddingBottom: Spacing.five,
  },
  block: {
    gap: Spacing.two,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  centeredText: {
    textAlign: 'center',
  },
  ownerBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#208AEF',
    borderRadius: Spacing.three,
    paddingVertical: Spacing.half,
    paddingHorizontal: Spacing.two,
  },
  ownerBadgeText: {
    color: '#ffffff',
  },
  qrContainer: {
    alignItems: 'center',
    paddingVertical: Spacing.two,
  },
  qrImage: {
    width: 220,
    height: 220,
  },
  secretText: {
    textAlign: 'center',
  },
  input: {
    borderWidth: 1,
    borderRadius: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    fontSize: 16,
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
  buttonDangerOutline: {
    borderWidth: 1,
    borderColor: '#D14343',
    borderRadius: Spacing.three,
    paddingVertical: Spacing.three,
    alignItems: 'center',
  },
  pressed: {
    opacity: 0.7,
  },
  error: {
    color: '#D14343',
  },
  success: {
    color: '#3FB27F',
  },
});

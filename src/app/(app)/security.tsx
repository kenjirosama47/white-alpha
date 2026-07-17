import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppErrorState } from '@/components/app-error-state';
import { AppLoadingState } from '@/components/app-loading-state';
import { Badge } from '@/components/badge';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { ScreenHeader } from '@/components/screen-header';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { SECURITY_COPY } from '@/constants/copy';
import { useAuth } from '@/contexts/auth-context';
import { useMfa } from '@/hooks/use-mfa';
import { useMyProfile } from '@/hooks/use-my-profile';
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
        <ScreenHeader title={SECURITY_COPY.title} onBack={() => router.back()} />

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
      <Card style={styles.block}>
        <ThemedText type="label" themeColor="textSecondary">
          Statut de session
        </ThemedText>
        <ThemedView style={styles.row}>
          <ThemedText type="bodySmall" themeColor="textSecondary">
            Connexion
          </ThemedText>
          <ThemedText type="bodySmall">
            {mfa.status?.currentLevel === 'aal2' ? 'Connecté — vérifié (MFA)' : 'Connecté'}
          </ThemedText>
        </ThemedView>
        {isOwner && <Badge label="Propriétaire" tone="accent" />}
      </Card>

      {isOwner ? (
        <OwnerMfaSection mfa={mfa} />
      ) : (
        <Card style={styles.block}>
          <ThemedText type="label" themeColor="textSecondary">
            Authentification multifacteur
          </ThemedText>
          <ThemedText type="bodySmall" themeColor="textSecondary">
            Aucune option d&apos;administration sur ce compte. L&apos;activation de l&apos;authentification
            multifacteur sera bientôt disponible pour tous les comptes.
          </ThemedText>
        </Card>
      )}
    </ScrollView>
  );
}

function OwnerMfaSection({ mfa }: { mfa: ReturnType<typeof useMfa> }) {
  const [justEnrolled, setJustEnrolled] = useState(false);
  const hasVerifiedFactor = (mfa.status?.verifiedFactors.length ?? 0) > 0;

  if (justEnrolled) {
    return (
      <Card style={styles.block}>
        <ThemedText type="label" themeColor="textSecondary">
          Authentification multifacteur
        </ThemedText>
        <ThemedText type="bodySmall" themeColor="accent">
          Authentification multifacteur activée.
        </ThemedText>
        <Button label="OK" onPress={() => setJustEnrolled(false)} />
      </Card>
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
    <Card style={styles.block}>
      <ThemedText type="label" themeColor="textSecondary">
        Authentification multifacteur
      </ThemedText>
      <ThemedView style={styles.row}>
        <ThemedText type="bodySmall" themeColor="textSecondary">
          État
        </ThemedText>
        <ThemedText type="bodySmall">{hasVerifiedFactor ? 'Vérifié' : 'Non configuré'}</ThemedText>
      </ThemedView>
      {mfa.enrollmentError && (
        <ThemedText type="bodySmall" themeColor="danger" accessibilityRole="alert">
          {mfa.enrollmentError}
        </ThemedText>
      )}
      {hasVerifiedFactor ? (
        <Button
          label="Désactiver"
          variant="danger"
          onPress={() => {
            const factorId = mfa.status?.verifiedFactors[0]?.id;
            if (factorId) mfa.startDisable(factorId);
          }}
        />
      ) : (
        <Button
          label={mfa.isStartingEnrollment ? 'Préparation…' : 'Configurer l’authentification'}
          onPress={mfa.startEnrollment}
          loading={mfa.isStartingEnrollment}
        />
      )}
    </Card>
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
  const [code, setCode] = useState('');

  return (
    <Card style={styles.block}>
      <ThemedText type="title">Protégez votre place dans la meute</ThemedText>
      <ThemedText type="bodySmall" themeColor="textSecondary">
        Saisissez votre code d&apos;authentification pour continuer.
      </ThemedText>
      <ThemedText type="bodySmall" themeColor="textSecondary">
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

      <ThemedText type="bodySmall" themeColor="textSecondary">
        Impossible de scanner ? Saisis ce code manuellement :
      </ThemedText>
      <ThemedText type="label" selectable style={styles.centeredText}>
        {enrollment.secret}
      </ThemedText>

      <TextField
        value={code}
        onChangeText={setCode}
        editable={!isVerifying}
        keyboardType="number-pad"
        maxLength={6}
        placeholder="Code à 6 chiffres"
        accessibilityLabel="Code à 6 chiffres"
      />

      {verifyError && (
        <ThemedText type="bodySmall" themeColor="danger" accessibilityRole="alert">
          {verifyError}
        </ThemedText>
      )}

      <Button
        label={isVerifying ? 'Vérification…' : 'Vérifier'}
        onPress={() => onVerify(code)}
        loading={isVerifying}
        disabled={code.length !== 6}
      />
      <Pressable onPress={() => onCancel()} disabled={isVerifying} hitSlop={8} accessibilityRole="button">
        <ThemedText type="link" themeColor="textSecondary" style={styles.centeredText}>
          Annuler
        </ThemedText>
      </Pressable>
    </Card>
  );
}

type DisableFlowProps = {
  isDisabling: boolean;
  disableError: string | null;
  onConfirm: (code: string) => Promise<boolean>;
  onCancel: () => void;
};

function DisableFlow({ isDisabling, disableError, onConfirm, onCancel }: DisableFlowProps) {
  const [code, setCode] = useState('');

  return (
    <Card style={styles.block}>
      <ThemedText type="label" themeColor="textSecondary">
        Désactiver l&apos;authentification multifacteur
      </ThemedText>
      <ThemedText type="bodySmall" themeColor="textSecondary">
        Pour confirmer la désactivation, saisis un nouveau code généré par ton application d&apos;authentification.
      </ThemedText>

      <TextField
        value={code}
        onChangeText={setCode}
        editable={!isDisabling}
        keyboardType="number-pad"
        maxLength={6}
        placeholder="Code à 6 chiffres"
        accessibilityLabel="Code à 6 chiffres"
      />

      {disableError && (
        <ThemedText type="bodySmall" themeColor="danger" accessibilityRole="alert">
          {disableError}
        </ThemedText>
      )}

      <Button
        label={isDisabling ? 'Désactivation…' : 'Confirmer la désactivation'}
        variant="danger"
        onPress={() => onConfirm(code)}
        loading={isDisabling}
        disabled={code.length !== 6}
      />
      <Pressable onPress={onCancel} disabled={isDisabling} hitSlop={8} accessibilityRole="button">
        <ThemedText type="link" themeColor="textSecondary" style={styles.centeredText}>
          Annuler
        </ThemedText>
      </Pressable>
    </Card>
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
  qrContainer: {
    alignItems: 'center',
    paddingVertical: Spacing.two,
  },
  qrImage: {
    width: 220,
    height: 220,
  },
});

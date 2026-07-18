import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';

import { AppErrorState } from '@/components/app-error-state';
import { AppLoadingState } from '@/components/app-loading-state';
import { AvatarImage } from '@/components/avatar-image';
import { Badge } from '@/components/badge';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { Divider } from '@/components/divider';
import { ScreenHeader } from '@/components/screen-header';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useAuth } from '@/contexts/auth-context';
import { useMyProfileContext } from '@/contexts/my-profile-context';
import { useProfileEditor } from '@/hooks/use-profile-editor';
import type { MyProfile } from '@/services/profiles';
import { DISPLAY_NAME_MAX_LENGTH, USERNAME_MAX_LENGTH } from '@/types/chat';

export default function ProfileScreen() {
  const { profile, isLoading, error, refresh, setProfile } = useMyProfileContext();
  const [isEditing, setIsEditing] = useState(false);

  return (
    <ThemedView style={styles.container}>
      <ScreenHeader
        title={isEditing ? 'Modifier le profil' : 'Profil'}
        onBack={isEditing ? () => setIsEditing(false) : undefined}
        backLabel={isEditing ? 'Annuler' : 'Retour'}
      />

      {isLoading ? (
        <AppLoadingState accessibilityLabel="Chargement du profil" />
      ) : error ? (
        <AppErrorState description={error} onRetry={refresh} />
      ) : !profile ? (
        <AppErrorState description="Profil introuvable." onRetry={refresh} />
      ) : isEditing ? (
        <ProfileEditForm
          profile={profile}
          onSaved={(updated) => {
            setProfile(updated);
            setIsEditing(false);
          }}
        />
      ) : (
        <ProfileView profile={profile} onEdit={() => setIsEditing(true)} />
      )}
    </ThemedView>
  );
}

type ProfileViewProps = {
  profile: MyProfile;
  onEdit: () => void;
};

function ProfileView({ profile, onEdit }: ProfileViewProps) {
  const { session, signOut } = useAuth();
  const [confirmingSignOut, setConfirmingSignOut] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);

  async function handleSignOut() {
    setIsSigningOut(true);
    setSignOutError(null);
    const { error } = await signOut();
    setIsSigningOut(false);
    if (error) {
      setSignOutError(error);
      setConfirmingSignOut(false);
      return;
    }
    // Après un signOut réussi, onAuthStateChange dans AuthProvider fait
    // passer isAuthenticated à false : la Stack racine redirige seule vers
    // (auth), sans navigation explicite ici (voir src/app/_layout.tsx).
  }

  return (
    <ScrollView contentContainerStyle={styles.scrollContent}>
      <ThemedView style={styles.profileBlock}>
        <AvatarImage
          avatarUrl={profile.avatarUrl}
          wolfPreset={profile.avatarPreset}
          displayName={profile.displayName}
          size={96}
        />
        <ThemedView style={styles.nameRow}>
          <ThemedText type="title" style={styles.centeredText}>
            {profile.displayName}
          </ThemedText>
          {profile.role === 'owner' && <Badge label="Propriétaire" />}
        </ThemedView>
        <ThemedText type="body" themeColor="textSecondary" style={styles.centeredText}>
          @{profile.username}
        </ThemedText>
        <ThemedView style={styles.profileActions}>
          <Button label="Modifier le profil" onPress={onEdit} variant="secondary" size="small" />
          <Button
            label="Choisir un avatar"
            onPress={() => router.push('/avatar-gallery')}
            variant="secondary"
            size="small"
          />
        </ThemedView>
      </ThemedView>

      <Card style={styles.settingsCard}>
        <ThemedText type="label" themeColor="textSecondary">
          Paramètres
        </ThemedText>

        <ThemedView style={styles.settingsRow}>
          <ThemedText type="bodySmall" themeColor="textSecondary">
            Confidentialité
          </ThemedText>
          <ThemedText type="bodySmall">
            Ton adresse email n&apos;est jamais visible par les autres utilisateurs.
          </ThemedText>
        </ThemedView>

        <Divider />

        <ThemedView style={styles.settingsRow}>
          <ThemedText type="bodySmall" themeColor="textSecondary">
            Connexion
          </ThemedText>
          <ThemedText type="bodySmall">{session?.user.email ?? 'Connecté'}</ThemedText>
        </ThemedView>

        <Divider />

        <Button label="Sécurité du compte" onPress={() => router.push('/security')} variant="ghost" size="small" />
        <Button label="Notifications" onPress={() => router.push('/notifications')} variant="ghost" size="small" />

        {typeof Constants.expoConfig?.version === 'string' && (
          <>
            <Divider />
            <ThemedView style={styles.settingsRow}>
              <ThemedText type="bodySmall" themeColor="textSecondary">
                Version
              </ThemedText>
              <ThemedText type="bodySmall">
                {Constants.expoConfig.version}
                {typeof Constants.expoConfig?.android?.versionCode === 'number'
                  ? ` — build ${Constants.expoConfig.android.versionCode}`
                  : ''}
              </ThemedText>
            </ThemedView>
          </>
        )}
      </Card>

      {signOutError && (
        <ThemedText type="bodySmall" themeColor="danger" accessibilityRole="alert" style={styles.centeredText}>
          {signOutError}
        </ThemedText>
      )}

      {confirmingSignOut ? (
        <ThemedView style={styles.confirmRow}>
          <ThemedText type="bodySmall" themeColor="textSecondary">
            Se déconnecter de White Alpha ?
          </ThemedText>
          <Button
            label={isSigningOut ? 'Déconnexion…' : 'Confirmer'}
            onPress={handleSignOut}
            disabled={isSigningOut}
            variant="danger"
            size="small"
          />
          <Button label="Annuler" onPress={() => setConfirmingSignOut(false)} disabled={isSigningOut} variant="ghost" size="small" />
        </ThemedView>
      ) : (
        <Button label="Se déconnecter" onPress={() => setConfirmingSignOut(true)} variant="danger" />
      )}
    </ScrollView>
  );
}

type ProfileEditFormProps = {
  profile: MyProfile;
  onSaved: (profile: MyProfile) => void;
};

function ProfileEditForm({ profile, onSaved }: ProfileEditFormProps) {
  const editor = useProfileEditor(profile, onSaved);
  const previewAvatarUrl = editor.pickedAvatar?.uri ?? profile.avatarUrl;

  return (
    <ScrollView contentContainerStyle={styles.scrollContent}>
      <ThemedView style={styles.profileBlock}>
        <AvatarImage
          avatarUrl={previewAvatarUrl}
          wolfPreset={profile.avatarPreset}
          displayName={profile.displayName}
          size={96}
        />

        <Button
          label={editor.pickedAvatar ? 'Choisir une autre photo' : 'Changer la photo de profil'}
          onPress={editor.pickAvatar}
          disabled={editor.isSaving}
          variant="ghost"
          size="small"
        />
        {editor.pickedAvatar && (
          <Button label="Annuler la nouvelle photo" onPress={editor.cancelAvatar} disabled={editor.isSaving} variant="ghost" size="small" />
        )}
        {editor.avatarError && (
          <ThemedText type="bodySmall" themeColor="danger" accessibilityRole="alert">
            {editor.avatarError}
          </ThemedText>
        )}
      </ThemedView>

      <ThemedView style={styles.formBlock}>
        <TextField
          label="Nom affiché"
          value={editor.displayName}
          onChangeText={editor.setDisplayName}
          editable={!editor.isSaving}
          maxLength={DISPLAY_NAME_MAX_LENGTH}
        />

        <TextField
          label="Nom d'utilisateur"
          value={editor.username}
          onChangeText={editor.setUsername}
          editable={!editor.isSaving}
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={USERNAME_MAX_LENGTH}
        />

        {editor.error && (
          <ThemedText type="bodySmall" themeColor="danger" accessibilityRole="alert">
            {editor.error}
          </ThemedText>
        )}
        {editor.success && (
          <ThemedText type="bodySmall" themeColor="accent">
            Profil mis à jour.
          </ThemedText>
        )}

        <Button
          label={editor.isSaving ? 'Enregistrement…' : 'Enregistrer'}
          onPress={editor.save}
          disabled={!editor.isDirty || editor.isSaving}
        />
      </ThemedView>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
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
  centeredText: {
    textAlign: 'center',
  },
  profileBlock: {
    alignItems: 'center',
    gap: Spacing.two,
    paddingTop: Spacing.three,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  profileActions: {
    flexDirection: 'row',
    gap: Spacing.two,
    marginTop: Spacing.two,
  },
  settingsCard: {
    gap: Spacing.two,
  },
  settingsRow: {
    gap: Spacing.half,
  },
  confirmRow: {
    gap: Spacing.two,
    alignItems: 'flex-start',
  },
  formBlock: {
    gap: Spacing.three,
  },
});

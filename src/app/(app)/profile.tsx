import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppErrorState } from '@/components/app-error-state';
import { AppLoadingState } from '@/components/app-loading-state';
import { AvatarImage } from '@/components/avatar-image';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useAuth } from '@/contexts/auth-context';
import { useMyProfile } from '@/hooks/use-my-profile';
import { useProfileEditor } from '@/hooks/use-profile-editor';
import { useTheme } from '@/hooks/use-theme';
import type { MyProfile } from '@/services/profiles';
import { DISPLAY_NAME_MAX_LENGTH, USERNAME_MAX_LENGTH } from '@/types/chat';

export default function ProfileScreen() {
  const { profile, isLoading, error, refresh, setProfile } = useMyProfile();
  const [isEditing, setIsEditing] = useState(false);

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedView style={styles.header}>
          <Pressable onPress={() => (isEditing ? setIsEditing(false) : router.back())} hitSlop={8}>
            <ThemedText type="link" themeColor="textSecondary">
              {isEditing ? 'Annuler' : 'Retour'}
            </ThemedText>
          </Pressable>
          <ThemedText type="subtitle">{isEditing ? 'Modifier le profil' : 'Profil'}</ThemedText>
          <ThemedView style={styles.headerSpacer} />
        </ThemedView>

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
      </SafeAreaView>
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
        <AvatarImage avatarUrl={profile.avatarUrl} displayName={profile.displayName} size={96} />
        <ThemedText type="subtitle" style={styles.centeredText}>
          {profile.displayName}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" style={styles.centeredText}>
          @{profile.username}
        </ThemedText>
        <Pressable
          onPress={onEdit}
          style={({ pressed }) => [styles.buttonSecondary, pressed && styles.pressed]}>
          <ThemedText type="smallBold">Modifier le profil</ThemedText>
        </Pressable>
      </ThemedView>

      <ThemedView style={styles.settingsBlock}>
        <ThemedText type="smallBold" themeColor="textSecondary">
          Paramètres
        </ThemedText>

        <ThemedView style={styles.settingsRow}>
          <ThemedText type="small" themeColor="textSecondary">
            Confidentialité
          </ThemedText>
          <ThemedText type="small">
            Ton adresse email n&apos;est jamais visible par les autres utilisateurs.
          </ThemedText>
        </ThemedView>

        <ThemedView style={styles.settingsRow}>
          <ThemedText type="small" themeColor="textSecondary">
            Connexion
          </ThemedText>
          <ThemedText type="small">{session?.user.email ?? 'Connecté'}</ThemedText>
        </ThemedView>

        {typeof Constants.expoConfig?.version === 'string' && (
          <ThemedView style={styles.settingsRow}>
            <ThemedText type="small" themeColor="textSecondary">
              Version
            </ThemedText>
            <ThemedText type="small">{Constants.expoConfig.version}</ThemedText>
          </ThemedView>
        )}

        {signOutError && (
          <ThemedText type="small" style={styles.error}>
            {signOutError}
          </ThemedText>
        )}

        {confirmingSignOut ? (
          <ThemedView style={styles.confirmRow}>
            <ThemedText type="small" themeColor="textSecondary">
              Se déconnecter de White Alpha ?
            </ThemedText>
            <Pressable onPress={handleSignOut} disabled={isSigningOut} hitSlop={8}>
              <ThemedText type="smallBold" style={styles.error}>
                {isSigningOut ? 'Déconnexion…' : 'Confirmer'}
              </ThemedText>
            </Pressable>
            <Pressable onPress={() => setConfirmingSignOut(false)} disabled={isSigningOut} hitSlop={8}>
              <ThemedText type="small" themeColor="textSecondary">
                Annuler
              </ThemedText>
            </Pressable>
          </ThemedView>
        ) : (
          <Pressable
            onPress={() => setConfirmingSignOut(true)}
            style={({ pressed }) => [styles.buttonDanger, pressed && styles.pressed]}>
            <ThemedText type="smallBold" style={styles.error}>
              Se déconnecter
            </ThemedText>
          </Pressable>
        )}
      </ThemedView>
    </ScrollView>
  );
}

type ProfileEditFormProps = {
  profile: MyProfile;
  onSaved: (profile: MyProfile) => void;
};

function ProfileEditForm({ profile, onSaved }: ProfileEditFormProps) {
  const theme = useTheme();
  const editor = useProfileEditor(profile, onSaved);
  const previewAvatarUrl = editor.pickedAvatar?.uri ?? profile.avatarUrl;

  return (
    <ScrollView contentContainerStyle={styles.scrollContent}>
      <ThemedView style={styles.profileBlock}>
        <AvatarImage avatarUrl={previewAvatarUrl} displayName={profile.displayName} size={96} />

        <Pressable onPress={editor.pickAvatar} disabled={editor.isSaving} hitSlop={8}>
          <ThemedText type="link" themeColor="textSecondary">
            {editor.pickedAvatar ? 'Choisir une autre photo' : 'Changer la photo de profil'}
          </ThemedText>
        </Pressable>
        {editor.pickedAvatar && (
          <Pressable onPress={editor.cancelAvatar} disabled={editor.isSaving} hitSlop={8}>
            <ThemedText type="small" themeColor="textSecondary">
              Annuler la nouvelle photo
            </ThemedText>
          </Pressable>
        )}
        {editor.avatarError && (
          <ThemedText type="small" style={styles.error}>
            {editor.avatarError}
          </ThemedText>
        )}
      </ThemedView>

      <ThemedView style={styles.formBlock}>
        <ThemedText type="small" themeColor="textSecondary">
          Nom affiché
        </ThemedText>
        <TextInput
          value={editor.displayName}
          onChangeText={editor.setDisplayName}
          editable={!editor.isSaving}
          maxLength={DISPLAY_NAME_MAX_LENGTH}
          style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
        />

        <ThemedText type="small" themeColor="textSecondary">
          Nom d&apos;utilisateur
        </ThemedText>
        <TextInput
          value={editor.username}
          onChangeText={editor.setUsername}
          editable={!editor.isSaving}
          autoCapitalize="none"
          maxLength={USERNAME_MAX_LENGTH}
          style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
        />

        {editor.error && (
          <ThemedText type="small" style={styles.error}>
            {editor.error}
          </ThemedText>
        )}
        {editor.success && (
          <ThemedText type="small" style={styles.success}>
            Profil mis à jour.
          </ThemedText>
        )}

        <Pressable
          onPress={editor.save}
          disabled={!editor.isDirty || editor.isSaving}
          style={({ pressed }) => [
            styles.buttonPrimary,
            (pressed || !editor.isDirty || editor.isSaving) && styles.pressed,
          ]}>
          <ThemedText type="smallBold" style={styles.buttonPrimaryLabel}>
            {editor.isSaving ? 'Enregistrement…' : 'Enregistrer'}
          </ThemedText>
        </Pressable>
      </ThemedView>
    </ScrollView>
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
  centeredText: {
    textAlign: 'center',
  },
  profileBlock: {
    alignItems: 'center',
    gap: Spacing.two,
    paddingTop: Spacing.three,
  },
  buttonSecondary: {
    marginTop: Spacing.two,
    borderWidth: 1,
    borderColor: '#60646C',
    borderRadius: Spacing.three,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.four,
  },
  buttonDanger: {
    alignItems: 'center',
    paddingVertical: Spacing.two,
  },
  buttonPrimary: {
    backgroundColor: '#208AEF',
    borderRadius: Spacing.three,
    paddingVertical: Spacing.three,
    alignItems: 'center',
    marginTop: Spacing.two,
  },
  buttonPrimaryLabel: {
    color: '#ffffff',
  },
  pressed: {
    opacity: 0.7,
  },
  settingsBlock: {
    gap: Spacing.three,
  },
  settingsRow: {
    gap: Spacing.half,
  },
  confirmRow: {
    gap: Spacing.two,
    alignItems: 'flex-start',
  },
  formBlock: {
    gap: Spacing.two,
  },
  input: {
    borderWidth: 1,
    borderRadius: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    fontSize: 16,
  },
  error: {
    color: '#D14343',
  },
  success: {
    color: '#3FB27F',
  },
});

import { useCallback, useRef, useState } from 'react';

import { pickAvatarFromLibrary, removeAvatarFile, uploadAvatar, type PickedAvatar } from '@/services/avatars';
import { updateMyProfile, type MyProfile } from '@/services/profiles';
import { validateDisplayName, validateUsername } from '@/types/chat';

type UseProfileEditorResult = {
  username: string;
  setUsername: (value: string) => void;
  displayName: string;
  setDisplayName: (value: string) => void;
  pickedAvatar: PickedAvatar | null;
  avatarError: string | null;
  pickAvatar: () => Promise<void>;
  cancelAvatar: () => void;
  /** Désactive Enregistrer tant que rien n'a changé. */
  isDirty: boolean;
  isSaving: boolean;
  error: string | null;
  success: boolean;
  save: () => Promise<boolean>;
};

/**
 * Édition du profil connecté : nom affiché, nom d'utilisateur, avatar.
 * `profile` est la valeur actuellement enregistrée (baseline de comparaison
 * pour `isDirty`) ; `onSaved` est appelé avec le profil mis à jour après un
 * enregistrement réussi, pour que l'écran appelant tienne sa propre copie à
 * jour (voir `use-my-profile.ts`).
 */
export function useProfileEditor(profile: MyProfile, onSaved: (profile: MyProfile) => void): UseProfileEditorResult {
  const [username, setUsername] = useState(profile.username);
  const [displayName, setDisplayName] = useState(profile.displayName);
  const [pickedAvatar, setPickedAvatar] = useState<PickedAvatar | null>(null);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Ref plutôt que le seul état isSaving : setState est asynchrone/batché et
  // n'empêcherait pas un double-tap arrivant avant le premier re-render
  // (même principe que isSendingRef dans use-messages.ts).
  const isSavingRef = useRef(false);

  const isDirty =
    username.trim().toLowerCase() !== profile.username ||
    displayName.trim() !== profile.displayName ||
    pickedAvatar !== null;

  const pickAvatar = useCallback(async () => {
    setAvatarError(null);
    try {
      const avatar = await pickAvatarFromLibrary();
      if (avatar) {
        setPickedAvatar(avatar);
        setSuccess(false);
      }
    } catch (err) {
      setAvatarError(err instanceof Error ? err.message : 'Erreur inconnue.');
    }
  }, []);

  const cancelAvatar = useCallback(() => {
    setPickedAvatar(null);
    setAvatarError(null);
  }, []);

  const save = useCallback(async () => {
    if (isSavingRef.current || !isDirty) return false;

    const usernameValidation = validateUsername(username);
    if (!usernameValidation.ok) {
      setError(usernameValidation.error);
      return false;
    }
    const displayNameValidation = validateDisplayName(displayName);
    if (!displayNameValidation.ok) {
      setError(displayNameValidation.error);
      return false;
    }

    isSavingRef.current = true;
    setIsSaving(true);
    setError(null);
    setSuccess(false);

    let uploadedPath: string | null = null;
    try {
      if (pickedAvatar) {
        const uploaded = await uploadAvatar(profile.id, pickedAvatar);
        uploadedPath = uploaded.storagePath;
      }

      const updated = await updateMyProfile({
        username,
        displayName,
        avatarPath: uploadedPath ?? undefined,
      });

      // Seulement après le succès complet de la RPC : jamais avant, pour ne
      // jamais se retrouver sans avatar valide si la RPC avait échoué.
      if (uploadedPath && profile.avatarPath) {
        await removeAvatarFile(profile.avatarPath);
      }

      setPickedAvatar(null);
      setSuccess(true);
      // `updateMyProfile` ne renvoie jamais `role` (jamais modifiable via ce
      // chemin, voir migration Phase 5.S3) ni `avatarPreset` (modifiable
      // uniquement via update_my_avatar_preset, Phase 7.5) : les deux sont
      // conservés depuis la baseline.
      onSaved({ ...updated, role: profile.role, avatarPreset: profile.avatarPreset });
      return true;
    } catch (err) {
      // La RPC a échoué après un upload réussi : supprime le NOUVEAU fichier
      // en compensation, jamais l'ancien (qui reste l'avatar affiché tant
      // que la mise à jour n'a pas réellement abouti). Ne supprime jamais un
      // fichier appartenant à un autre utilisateur : `uploadedPath` vient
      // exclusivement de l'upload que cette fonction vient de faire elle-même.
      if (uploadedPath) {
        await removeAvatarFile(uploadedPath);
      }
      setError(err instanceof Error ? err.message : 'Erreur inconnue.');
      return false;
    } finally {
      isSavingRef.current = false;
      setIsSaving(false);
    }
  }, [isDirty, username, displayName, pickedAvatar, profile, onSaved]);

  return {
    username,
    setUsername,
    displayName,
    setDisplayName,
    pickedAvatar,
    avatarError,
    pickAvatar,
    cancelAvatar,
    isDirty,
    isSaving,
    error,
    success,
    save,
  };
}

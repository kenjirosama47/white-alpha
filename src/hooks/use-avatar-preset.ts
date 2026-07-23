import { useCallback, useRef, useState } from 'react';

import type { WolfAvatarId } from '@/constants/avatars';
import { removeAvatarFile } from '@/services/avatars';
import { updateMyAvatarPreset, type MyProfile } from '@/services/profiles';

type UseAvatarPresetResult = {
  /** Sélection en cours (aperçu) — distincte de l'avatar réellement enregistré tant que `save()` n'a pas réussi. */
  selected: WolfAvatarId;
  select: (id: WolfAvatarId) => void;
  /** `false` tant que la sélection correspond à l'avatar déjà enregistré. */
  isDirty: boolean;
  isSaving: boolean;
  error: string | null;
  success: boolean;
  save: () => Promise<boolean>;
  /** Revient à l'avatar déjà enregistré, sans aucune modification (bouton Annuler). */
  reset: () => void;
};

/**
 * Sélection d'un avatar loup prédéfini (galerie, Phase 7.5). `profile` est la
 * valeur actuellement enregistrée (baseline de comparaison pour `isDirty` et
 * repli en cas d'échec) ; `onSaved` n'est appelé qu'après un enregistrement
 * réussi — en cas d'échec, l'ancien avatar reste affiché partout ailleurs
 * dans l'app (aucun appel à `onSaved`), seul l'aperçu de cet écran reflète la
 * tentative.
 */
export function useAvatarPreset(profile: MyProfile, onSaved: (profile: MyProfile) => void): UseAvatarPresetResult {
  const [selected, setSelected] = useState<WolfAvatarId>(profile.avatarPreset);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Ref plutôt que le seul état isSaving : setState est asynchrone/batché et
  // n'empêcherait pas un double-tap arrivant avant le premier re-render
  // (même principe que isSavingRef dans use-profile-editor.ts).
  const isSavingRef = useRef(false);

  const isDirty = selected !== profile.avatarPreset;

  const select = useCallback((id: WolfAvatarId) => {
    setSelected(id);
    setSuccess(false);
    setError(null);
  }, []);

  const reset = useCallback(() => {
    setSelected(profile.avatarPreset);
    setError(null);
    setSuccess(false);
  }, [profile.avatarPreset]);

  const save = useCallback(async () => {
    if (isSavingRef.current || !isDirty) return false;

    isSavingRef.current = true;
    setIsSaving(true);
    setError(null);
    setSuccess(false);

    try {
      const result = await updateMyAvatarPreset(selected);
      setSuccess(true);
      // Choisir un préréglage remplace toute photo personnelle existante
      // (voir migration 20260723170000) : avatarUrl/avatarPath doivent donc
      // être effacés localement aussi, sinon AvatarImage continuerait
      // d'afficher l'ancienne photo (priorité à avatarUrl) jusqu'au
      // prochain rechargement complet du profil.
      onSaved({ ...profile, avatarPreset: result.avatarPreset, avatarUrl: null, avatarPath: null });
      // Nettoyage best-effort de l'ancien fichier Storage, seulement après
      // le succès complet de la RPC — même politique que
      // use-profile-editor.ts (jamais avant, jamais bloquant pour l'UI).
      if (result.previousAvatarPath) {
        await removeAvatarFile(result.previousAvatarPath);
      }
      return true;
    } catch (err) {
      // Échec : `onSaved` n'est jamais appelé, donc le profil affiché
      // ailleurs (écran Profil, en-têtes de conversation, etc.) conserve
      // l'ancien avatar_preset — rien n'est modifié tant que la RPC n'a pas
      // réussi.
      setError(err instanceof Error ? err.message : 'Erreur inconnue.');
      return false;
    } finally {
      isSavingRef.current = false;
      setIsSaving(false);
    }
  }, [isDirty, selected, profile, onSaved]);

  return { selected, select, isDirty, isSaving, error, success, save, reset };
}

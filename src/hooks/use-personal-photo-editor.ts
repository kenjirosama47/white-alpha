import { useCallback, useState } from 'react';

import { deletePersonalPhotoFile, savePersonalPhotoFile } from '@/lib/personal-photo-storage';
import { compressPersonalPhoto, pickPersonalPhotoFromLibrary } from '@/services/personal-photo';

type UsePersonalPhotoEditorResult = {
  /** URI privée déjà enregistrée (recadrée, compressée) en attente de confirmation — jamais encore appliquée à une préférence. */
  previewUri: string | null;
  isPicking: boolean;
  isProcessing: boolean;
  error: string | null;
  /** Sélection + recadrage natif + compression + enregistrement dans le stockage privé (en attente) ; ne fait rien si l'utilisateur annule à une étape quelconque. */
  pick: () => Promise<void>;
  /** Efface l'aperçu en attente SANS supprimer son fichier — à utiliser uniquement après une confirmation réussie (le fichier devient la référence appliquée). */
  clearAfterConfirm: () => void;
  /** Supprime le fichier en attente et efface l'aperçu — bouton Annuler. */
  cancel: () => Promise<void>;
};

/**
 * Édition d'une photo personnelle (Phase 10.5a) : séparée en étapes
 * distinctes (sélection → validation → recadrage natif → compression →
 * stockage local), chacune déléguée à `services/personal-photo.ts` /
 * `lib/personal-photo-storage.ts`. Ce hook ne connaît jamais
 * `AppearancePreferences` : appliquer/remplacer/supprimer dans une section
 * (accueil/conversation/profil) reste la responsabilité de l'écran
 * appelant, qui décide seul quand supprimer une ancienne photo remplacée.
 */
export function usePersonalPhotoEditor(): UsePersonalPhotoEditorResult {
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [isPicking, setIsPicking] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pick = useCallback(async () => {
    setError(null);
    setIsPicking(true);
    let picked;
    try {
      picked = await pickPersonalPhotoFromLibrary();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue.');
      setIsPicking(false);
      return;
    }
    setIsPicking(false);

    // Sélection ou recadrage annulé par l'utilisateur : rien à faire, pas une erreur.
    if (!picked) return;

    setIsProcessing(true);
    try {
      const compressed = await compressPersonalPhoto(picked.uri);
      const savedUri = await savePersonalPhotoFile(compressed.uri);
      setPreviewUri(savedUri);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible de préparer cette photo pour le moment.');
    } finally {
      setIsProcessing(false);
    }
  }, []);

  const clearAfterConfirm = useCallback(() => {
    setPreviewUri(null);
    setError(null);
  }, []);

  const cancel = useCallback(async () => {
    if (previewUri) {
      await deletePersonalPhotoFile(previewUri);
    }
    setPreviewUri(null);
    setError(null);
  }, [previewUri]);

  return { previewUri, isPicking, isProcessing, error, pick, clearAfterConfirm, cancel };
}

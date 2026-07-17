import type { Component, ComponentClass } from 'react';
import { AccessibilityInfo, findNodeHandle } from 'react-native';

/**
 * Restaure le focus d'accessibilité sur l'élément déclencheur d'une
 * visionneuse plein écran (image ou vidéo), une fois celle-ci refermée.
 * `node` peut avoir été démonté entre l'ouverture et la fermeture (message
 * supprimé, liste re-paginée, vidéo passée en lecture) : ne fait alors
 * simplement rien, jamais d'exception propagée à l'appelant.
 *
 * Typage volontairement large : accepte aussi bien la ref d'un `View`/
 * `Pressable` que celle d'un composant natif à base de classe (ex.
 * `VideoView` d'expo-video), tout comme `findNodeHandle` lui-même.
 */
export function restoreAccessibilityFocus(node: object | null): void {
  if (!node) return;
  try {
    const handle = findNodeHandle(node as ComponentClass<unknown, unknown> | Component<unknown, unknown, unknown>);
    if (handle == null) return;
    AccessibilityInfo.setAccessibilityFocus(handle);
  } catch {
    // `findNodeHandle` lève si `node` ne correspond plus à un composant
    // React monté ; `setAccessibilityFocus` peut lever si le handle natif
    // est déjà invalide côté plateforme. Dans les deux cas : aucune
    // restauration possible, ne doit jamais faire planter l'écran.
  }
}

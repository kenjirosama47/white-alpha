/**
 * `supabase.auth.mfa.enroll({ factorType: 'totp' })` renvoie
 * `data.totp.qr_code` comme une chaîne SVG BRUTE (jamais déjà une data URI) —
 * confirmé par le type `AuthMFAEnrollTOTPResponseFields` de `@supabase/auth-js`
 * (commentaire officiel : « convert it to a URL by prepending
 * `data:image/svg+xml;utf-8,` »). Cette recette officielle est cependant
 * syntaxiquement invalide au sens strict (RFC 2397 : un paramètre de type
 * media doit être `clé=valeur`, jamais un jeton nu comme `;utf-8`) — constaté
 * en production (Phase MFA, incident réel) : le rendu du QR devenait
 * silencieusement peu fiable selon le navigateur. Le base64 ci-dessous est
 * sans ambiguïté (RFC 2397 stricte) et supporté partout, contrairement au
 * pourcentage-encodage brut d'un XML complet (guillemets, `<`, `>`, `#`).
 */
export function buildQrCodeDataUri(qrCode: string): string {
  // Défense en profondeur si Supabase renvoie un jour déjà une data URI
  // utilisable telle quelle : ne jamais la ré-envelopper.
  if (qrCode.startsWith('data:')) {
    return qrCode;
  }

  const base64 = Buffer.from(qrCode, 'utf-8').toString('base64');
  return `data:image/svg+xml;base64,${base64}`;
}

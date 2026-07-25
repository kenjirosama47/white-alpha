'use server';

import { logAuthDiagnostic } from '@/lib/auth-diagnostics';
import { INVITATION_BLOCKED_COPY } from '@/lib/copy';
import { hashInvitationCode, hashRequestIp, invitationCodeHashPrefix } from '@/lib/invitation-rate-limit';
import { getAuthCallbackUrl } from '@/lib/site-url';
import { createClient } from '@/lib/supabase/server';
import { isValidUsername, MIN_PASSWORD_LENGTH, normalizeUsername } from '@/lib/validation';

export type RegisterState = {
  error: string | null;
  submitted: boolean;
};

const GENERIC_ERROR = 'Une erreur est survenue. Réessaie.';
const USERNAME_ERROR =
  "Le nom d'utilisateur doit contenir entre 3 et 24 caractères : lettres minuscules, chiffres ou underscore uniquement.";
const PASSWORD_MISMATCH_ERROR = 'Les deux mots de passe ne correspondent pas.';
const PRIVACY_REQUIRED_ERROR = 'Merci d’accepter la politique de confidentialité pour continuer.';

/**
 * Enregistre le résultat d'une tentative pour le rate limiting, best-effort
 * (voir `is_invitation_rate_limited`) : un échec ici ne doit jamais faire
 * échouer ni changer le message déjà décidé par l'appelant. Centralisé ici
 * (au lieu de 4 blocs try/catch identiques) : `supabase.rpc(...)` renvoie un
 * `PostgrestFilterBuilder`, pas une vraie `Promise` (pas de `.catch()` dans
 * son typage) — `await` dans un `try/catch` fonctionne, contrairement à un
 * chaînage `.catch()` direct.
 */
async function recordInvitationAttemptBestEffort(
  supabase: Awaited<ReturnType<typeof createClient>>,
  ipHash: string,
  codePrefix: string,
  success: boolean,
): Promise<void> {
  try {
    await supabase.rpc('record_invitation_attempt', { p_ip_hash: ipHash, p_code_hash_prefix: codePrefix, p_success: success });
  } catch {
    // Volontairement silencieux, voir note ci-dessus.
  }
}

/**
 * `username` est obligatoire côté serveur Supabase : le déclencheur
 * `handle_new_user` (voir `lib/validation.ts`) rejette toute inscription
 * sans nom d'utilisateur valide — cette action ne fait qu'anticiper ce refus
 * avec un message clair, jamais le contourner. Il en va de même pour le
 * code d'invitation, obligatoire depuis la même fonction (Phase 8.9) : la
 * validation réelle et la consommation atomique vivent entièrement dans
 * `handle_new_user`, jamais dupliquées ici.
 *
 * Message unique pour les 6 cas de blocage liés au code (absent, inconnu,
 * expiré, révoqué, déjà utilisé, rate limiting) — voir `INVITATION_BLOCKED_COPY`.
 * Cette action ne lit JAMAIS `error.message`/`error.code` d'une réponse
 * Supabase pour décider du texte à afficher (bug réel rencontré et corrigé
 * en session : GoTrue enveloppe toute exception levée par le trigger
 * `handle_new_user` dans un message générique "Database error saving new
 * user", HTTP 500 — jamais le message Postgres brut pour un vrai visiteur,
 * contrairement à l'API Admin. Comparer `error.message` à un texte attendu
 * est donc intrinsèquement peu fiable pour ce cas). À la place, la validité
 * du code est vérifiée EN AMONT par un appel dédié, en lecture seule
 * (`is_invitation_code_usable`, jamais l'API `signUp`) : si le code n'est
 * pas utilisable, `signUp` n'est même jamais appelé.
 *
 * Anti-énumération (conservée à l'identique) : le résultat réel de `signUp`
 * pour toute cause AUTRE que le code d'invitation (succès véritable, adresse
 * déjà enregistrée côté Supabase, erreur réseau/serveur générale, ou la rare
 * course où le code est consommé par une inscription concurrente entre la
 * pré-vérification et `signUp`) n'est **jamais** distingué au-delà de ce
 * point — un seul message générique de succès simulé couvre tous ces cas,
 * exactement comme avant.
 */
export async function registerAction(_prevState: RegisterState, formData: FormData): Promise<RegisterState> {
  const invitationCode = String(formData.get('invitationCode') ?? '').trim();
  const username = normalizeUsername(String(formData.get('username') ?? ''));
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  const confirmPassword = String(formData.get('confirmPassword') ?? '');
  const acceptedPrivacy = formData.get('acceptPrivacy') === 'on';

  if (!invitationCode) {
    return { error: INVITATION_BLOCKED_COPY.message, submitted: false };
  }
  if (!email || !password) {
    return { error: GENERIC_ERROR, submitted: false };
  }
  if (!isValidUsername(username)) {
    return { error: USERNAME_ERROR, submitted: false };
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { error: `Le mot de passe doit contenir au moins ${MIN_PASSWORD_LENGTH} caractères.`, submitted: false };
  }
  if (password !== confirmPassword) {
    return { error: PASSWORD_MISMATCH_ERROR, submitted: false };
  }
  if (!acceptedPrivacy) {
    return { error: PRIVACY_REQUIRED_ERROR, submitted: false };
  }

  const supabase = await createClient();
  const codePrefix = invitationCodeHashPrefix(invitationCode);
  const codeHash = hashInvitationCode(invitationCode);

  let ipHash: string;
  try {
    ipHash = await hashRequestIp();
  } catch {
    // Échec fermé : sans secret de hachage IP configuré (voir
    // invitation-rate-limit.ts), impossible de garantir le rate limiting —
    // jamais silencieusement contourné, même message générique que les
    // autres cas de blocage (ne révèle jamais la cause exacte du refus).
    logAuthDiagnostic('signup', 'invitation_ip_hash_unavailable');
    return { error: INVITATION_BLOCKED_COPY.message, submitted: false };
  }

  const { data: isLimited, error: rateLimitError } = await supabase.rpc('is_invitation_rate_limited', {
    p_ip_hash: ipHash,
    p_code_hash_prefix: codePrefix,
  });

  if (rateLimitError || isLimited) {
    await recordInvitationAttemptBestEffort(supabase, ipHash, codePrefix, false);
    logAuthDiagnostic('signup', rateLimitError ? 'invitation_rate_limit_check_failed' : 'invitation_rate_limited');
    return { error: INVITATION_BLOCKED_COPY.message, submitted: false };
  }

  // Pré-vérification en lecture seule (jamais de verrou, jamais de
  // consommation — la fonction est `stable`, voir la migration) : source de
  // vérité unique pour décider si l'inscription peut continuer, plutôt que
  // d'interpréter après coup l'erreur renvoyée par `signUp` (voir note de
  // fonction ci-dessus). Un booléen unique, jamais un statut détaillé :
  // `is_invitation_code_usable` ne distingue jamais "inconnu" de "expiré",
  // "révoqué" ou "déjà utilisé" dans sa valeur de retour.
  const { data: isUsable, error: usableCheckError } = await supabase.rpc('is_invitation_code_usable', {
    p_code_hash: codeHash,
  });

  if (usableCheckError || !isUsable) {
    await recordInvitationAttemptBestEffort(supabase, ipHash, codePrefix, false);
    logAuthDiagnostic('signup', usableCheckError ? 'invitation_usable_check_failed' : 'invitation_code_unusable');
    return { error: INVITATION_BLOCKED_COPY.message, submitted: false };
  }

  try {
    // `options.data.username`/`invitation_code` : jamais de rôle ni de
    // statut privilégié transmis ici — un compte créé depuis ce formulaire
    // ne peut jamais devenir "owner" par ce biais. `invitation_code` n'est
    // lu qu'une fois par `handle_new_user`, jamais recopié vers profiles,
    // et effacé de user_metadata ci-dessous après usage (best-effort, voir
    // note plus bas).
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { username, invitation_code: invitationCode }, emailRedirectTo: getAuthCallbackUrl() },
    });

    if (error) {
      // Jamais de branchement sur error.message/error.status ici (voir note
      // de fonction) : que ce soit la rare course évoquée plus haut, une
      // adresse déjà enregistrée, ou une erreur serveur générale, un seul
      // traitement anti-énumération — le diagnostic serveur garde le statut
      // HTTP (non sensible) pour investigation, jamais exposé au client.
      await recordInvitationAttemptBestEffort(supabase, ipHash, codePrefix, false);
      logAuthDiagnostic('signup', 'supabase_signup_error', error.status);
      return { error: null, submitted: true };
    }

    await recordInvitationAttemptBestEffort(supabase, ipHash, codePrefix, true);
    logAuthDiagnostic('signup', 'supabase_signup_ok');

    // Nettoyage best-effort du code brut dans user_metadata (voir migration
    // 20260723180000, section 8 : le déclencheur l'efface déjà en base,
    // mais GoTrue réécrit ensuite user_metadata avec sa propre copie de la
    // requête d'origine dans le même appel signUp — vérifié empiriquement en
    // local — d'où ce second effacement, seul réellement efficace). Ne
    // s'applique que si une session existe immédiatement (confirmation email
    // désactivée) : sinon, aucune session tant que l'email n'est pas
    // confirmé — limite documentée, pas silencieusement ignorée.
    if (data.session) {
      await supabase.auth.updateUser({ data: { invitation_code: null } }).catch(() => {
        // Best-effort, volontairement silencieux (même politique que
        // removeAvatarFile côté mobile/web) : un échec ici ne remet jamais
        // en cause une inscription déjà réussie.
      });
    }
  } catch {
    await recordInvitationAttemptBestEffort(supabase, ipHash, codePrefix, false);
    logAuthDiagnostic('signup', 'unexpected_exception');
    return { error: null, submitted: true };
  }

  return { error: null, submitted: true };
}

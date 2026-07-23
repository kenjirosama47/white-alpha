'use server';

import { logAuthDiagnostic } from '@/lib/auth-diagnostics';
import { REGISTRATION_CLOSED_COPY } from '@/lib/copy';
import { PUBLIC_REGISTRATION_ENABLED } from '@/lib/registration-config';
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
 * `username` est obligatoire côté serveur Supabase : le déclencheur
 * `handle_new_user` (voir `lib/validation.ts`) rejette toute inscription
 * sans nom d'utilisateur valide — cette action ne fait qu'anticiper ce refus
 * avec un message clair, jamais le contourner.
 *
 * Anti-énumération (corrigé après revue) : le résultat réel de `signUp`
 * (succès véritable, adresse déjà enregistrée côté Supabase, ou toute autre
 * erreur) n'est **jamais** distingué au-delà de ce point — aucun
 * branchement sur le contenu de l'erreur retournée, aucun texte spécifique
 * renvoyé au visiteur. Un seul message générique couvre tous les cas,
 * exactement comme `forgotPasswordAction`. Les validations ci-dessus
 * (username, longueur de mot de passe, correspondance, case privée) restent
 * des erreurs distinctes : elles ne dépendent que de la saisie de ce
 * formulaire précis, jamais de l'existence d'un compte, donc ne révèlent
 * rien sur d'autres utilisateurs.
 */
export async function registerAction(_prevState: RegisterState, formData: FormData): Promise<RegisterState> {
  // Défense en profondeur (voir `registration-config.ts`) : `RegisterPage`
  // ne rend déjà plus le formulaire tant que l'inscription publique est
  // désactivée, mais une Server Action reste un endpoint POST atteignable
  // directement — jamais une confiance uniquement placée dans l'absence du
  // formulaire côté client. Vérifié avant toute lecture de `formData` :
  // aucune trace de la tentative (email, username) n'est journalisée.
  if (!PUBLIC_REGISTRATION_ENABLED) {
    return { error: REGISTRATION_CLOSED_COPY.message, submitted: false };
  }

  const username = normalizeUsername(String(formData.get('username') ?? ''));
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  const confirmPassword = String(formData.get('confirmPassword') ?? '');
  const acceptedPrivacy = formData.get('acceptPrivacy') === 'on';

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

  try {
    const supabase = await createClient();
    // `options.data.username` : jamais de rôle ni de statut privilégié
    // transmis ici (`isOwner`, `role`, etc. n'existent pas dans ce payload) —
    // un compte créé depuis ce formulaire ne peut jamais devenir "owner" par
    // ce biais, le déclencheur Supabase (jamais modifié ici) n'accepte que
    // `username`. Le résultat (`error`) n'est jamais utilisé pour choisir un
    // message différent (voir note ci-dessus) : seul un statut non sensible
    // part vers le diagnostic serveur temporaire, jamais vers le client.
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { username }, emailRedirectTo: getAuthCallbackUrl() },
    });
    logAuthDiagnostic('signup', error ? 'supabase_signup_error' : 'supabase_signup_ok', error?.status);
  } catch {
    // Échec inattendu (réseau, configuration) : jamais remonté tel quel au
    // visiteur — même message générique que pour un succès ou une adresse
    // déjà enregistrée (anti-énumération), diagnostic serveur uniquement.
    logAuthDiagnostic('signup', 'unexpected_exception');
  }

  return { error: null, submitted: true };
}

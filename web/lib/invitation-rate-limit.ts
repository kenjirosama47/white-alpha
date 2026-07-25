import { createHash, createHmac } from 'crypto';
import { headers } from 'next/headers';

/**
 * Secret serveur pour le hachage de l'IP (HMAC) — jamais préfixé
 * NEXT_PUBLIC_, jamais transmis à Postgres ni au navigateur. Voir
 * `.env.example` pour la procédure de configuration en production.
 */
function getIpHashSecret(): string {
  const secret = process.env.INVITATION_IP_HASH_SECRET;
  if (!secret) {
    // Échec fermé (fail-closed) : sans secret configuré, on ne peut pas
    // garantir que l'IP ne finit pas hachée avec une valeur prévisible —
    // préférable de bloquer l'inscription plutôt que d'affaiblir
    // silencieusement le rate limiting.
    throw new Error('INVITATION_IP_HASH_SECRET manquant.');
  }
  return secret;
}

/**
 * IP du visiteur, lue depuis les en-têtes standard posés par la plupart des
 * hébergeurs/proxys inverses (Vercel, Cloudflare...). Jamais stockée en
 * clair : uniquement son HMAC (voir hashRequestIp).
 */
async function getRequestIp(): Promise<string> {
  const h = await headers();
  const forwardedFor = h.get('x-forwarded-for');
  if (forwardedFor) {
    return forwardedFor.split(',')[0]!.trim();
  }
  return h.get('x-real-ip') ?? 'unknown';
}

export async function hashRequestIp(): Promise<string> {
  const ip = await getRequestIp();
  return createHmac('sha256', getIpHashSecret()).update(ip).digest('hex');
}

/** sha256 du code normalisé (majuscules, sans espaces) — identique au calcul serveur (handle_new_user) pour que la comparaison en base fonctionne. */
export function hashInvitationCode(rawCode: string): string {
  return createHash('sha256').update(rawCode.trim().toUpperCase()).digest('hex');
}

/**
 * Préfixe tronqué (16 caractères hex, jamais le hash complet) : suffisant
 * pour regrouper les tentatives visant un même code sans permettre une
 * recherche exacte depuis le seul journal de tentatives.
 */
export function invitationCodeHashPrefix(rawCode: string): string {
  return hashInvitationCode(rawCode).slice(0, 16);
}

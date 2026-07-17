// Edge Function : notify-new-message
//
// Déclenchée exclusivement par le trigger Postgres notify_new_message_trigger
// (voir supabase/migrations/20260717190000_push_notifications.sql), jamais
// appelable librement pour notifier un compte arbitraire : toute requête
// sans l'en-tête x-notify-secret correct (comparé au secret Supabase
// NOTIFY_SHARED_SECRET, jamais présent côté client) est refusée avant toute
// lecture de données.
//
// Parcours : nouveau message -> vérifier le secret -> récupérer message et
// conversation -> identifier le destinataire (jamais l'expéditeur) ->
// appliquer ses préférences -> récupérer ses appareils actifs -> dédupliquer
// par (message_id, appareil) -> envoyer une notification minimale via
// l'API Expo Push -> désactiver les tokens invalides. Aucun token n'est
// jamais journalisé en clair ni renvoyé dans la réponse HTTP.

import { createClient } from 'npm:@supabase/supabase-js@2';

const EXPO_PUSH_ENDPOINT = 'https://exp.host/--/api/v2/push/send';
const EXPO_PUSH_TIMEOUT_MS = 8000;

const DEFAULT_TITLE = 'Nouveau message';
const DEFAULT_BODY = 'Vous avez reçu un nouveau message';

type NotifyPayload = {
  message_id?: unknown;
  conversation_id?: unknown;
  sender_id?: unknown;
};

type PushDevice = {
  id: string;
  expo_push_token: string;
  sound_enabled: boolean;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Ne journalise jamais un token complet : seulement un préfixe court, suffisant pour corréler des logs sans exposer de secret exploitable. */
function redactToken(token: string): string {
  return `${token.slice(0, 12)}…(${token.length})`;
}

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

function jsonResponse(body: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'method_not_allowed' }, 405);
  }

  const expectedSecret = Deno.env.get('NOTIFY_SHARED_SECRET');
  const providedSecret = req.headers.get('x-notify-secret');
  if (!expectedSecret || !providedSecret || providedSecret !== expectedSecret) {
    return jsonResponse({ error: 'unauthorized' }, 401);
  }

  let payload: NotifyPayload;
  try {
    payload = (await req.json()) as NotifyPayload;
  } catch {
    return jsonResponse({ error: 'invalid_body' }, 400);
  }

  if (!isUuid(payload.message_id) || !isUuid(payload.conversation_id) || !isUuid(payload.sender_id)) {
    return jsonResponse({ error: 'invalid_ids' }, 400);
  }
  const messageId = payload.message_id;
  const conversationId = payload.conversation_id;
  const senderId = payload.sender_id;

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) {
    console.error('[notify-new-message] Configuration serveur manquante.');
    return jsonResponse({ error: 'server_misconfigured' }, 200);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  // 1. Le message existe-t-il toujours ? (peut avoir été supprimé entre
  //    l'insertion et l'exécution de cette fonction)
  const { data: message } = await supabase
    .from('messages')
    .select('id, conversation_id, sender_id')
    .eq('id', messageId)
    .maybeSingle();

  if (!message || message.conversation_id !== conversationId || message.sender_id !== senderId) {
    return jsonResponse({ notified: 0, reason: 'message_absent' }, 200);
  }

  // 2. Conversation et destinataire : l'expéditeur n'est jamais notifié.
  const { data: conversation } = await supabase
    .from('conversations')
    .select('id, user_a, user_b')
    .eq('id', conversationId)
    .maybeSingle();

  if (!conversation) {
    return jsonResponse({ notified: 0, reason: 'conversation_absente' }, 200);
  }

  let recipientId: string;
  if (conversation.user_a === senderId) {
    recipientId = conversation.user_b;
  } else if (conversation.user_b === senderId) {
    recipientId = conversation.user_a;
  } else {
    // L'expéditeur n'est pas (plus) participant : rien à notifier.
    return jsonResponse({ notified: 0, reason: 'expediteur_non_participant' }, 200);
  }

  if (recipientId === senderId) {
    return jsonResponse({ notified: 0, reason: 'destinataire_egal_expediteur' }, 200);
  }

  // 3. Préférences du destinataire (valeurs par défaut si aucune ligne :
  //    identiques aux défauts de colonne — notifications activées).
  const { data: preferences } = await supabase
    .from('notification_preferences')
    .select('notifications_enabled, sound_enabled')
    .eq('user_id', recipientId)
    .maybeSingle();

  const notificationsEnabled = preferences?.notifications_enabled ?? true;
  const soundEnabled = preferences?.sound_enabled ?? true;

  if (!notificationsEnabled) {
    return jsonResponse({ notified: 0, reason: 'preferences_desactivees' }, 200);
  }

  // 4. Appareils actifs du destinataire uniquement.
  const { data: devicesRaw } = await supabase
    .from('user_push_devices')
    .select('id, expo_push_token')
    .eq('user_id', recipientId)
    .eq('enabled', true);

  const devices: PushDevice[] = (devicesRaw ?? []).map((d) => ({
    id: d.id as string,
    expo_push_token: d.expo_push_token as string,
    sound_enabled: soundEnabled,
  }));

  if (devices.length === 0) {
    return jsonResponse({ notified: 0, reason: 'aucun_appareil' }, 200);
  }

  // 5. Déduplication par (message_id, appareil) : insertion en verrou, un
  //    conflit signifie "déjà envoyé pour ce message à cet appareil".
  const dedupedDevices: PushDevice[] = [];
  for (const device of devices) {
    const { error: insertError } = await supabase
      .from('push_notification_log')
      .insert({ message_id: messageId, device_id: device.id });
    if (!insertError) {
      dedupedDevices.push(device);
    }
  }

  if (dedupedDevices.length === 0) {
    return jsonResponse({ notified: 0, reason: 'deja_notifie' }, 200);
  }

  // 6. Envoi via l'API Expo Push : contenu minimal, jamais le contenu réel
  //    du message ni l'identité complète de l'expéditeur.
  const expoMessages = dedupedDevices.map((device) => ({
    to: device.expo_push_token,
    title: DEFAULT_TITLE,
    body: DEFAULT_BODY,
    sound: device.sound_enabled ? 'default' : undefined,
    data: { conversationId, messageId },
  }));

  let expoResult: Array<{ status: string; message?: string; details?: { error?: string } }> = [];
  try {
    const response = await fetch(EXPO_PUSH_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(expoMessages),
      signal: AbortSignal.timeout(EXPO_PUSH_TIMEOUT_MS),
    });
    const json = await response.json();
    expoResult = Array.isArray(json?.data) ? json.data : [];
  } catch (err) {
    console.error('[notify-new-message] Échec réseau Expo Push:', err instanceof Error ? err.message : 'erreur inconnue');
    return jsonResponse({ notified: 0, reason: 'echec_reseau_expo' }, 200);
  }

  // 7. Désactivation des tokens invalides signalés par Expo.
  const invalidDeviceIds: string[] = [];
  expoResult.forEach((ticket, index) => {
    if (ticket.status === 'error' && ticket.details?.error === 'DeviceNotRegistered') {
      const device = dedupedDevices[index];
      if (device) invalidDeviceIds.push(device.id);
    }
  });

  if (invalidDeviceIds.length > 0) {
    await supabase.from('user_push_devices').update({ enabled: false }).in('id', invalidDeviceIds);
  }

  console.log(
    `[notify-new-message] ${dedupedDevices.length} appareil(s) notifié(s), ${invalidDeviceIds.length} désactivé(s). Tokens: ${dedupedDevices
      .map((d) => redactToken(d.expo_push_token))
      .join(', ')}`,
  );

  return jsonResponse({ notified: dedupedDevices.length, deactivated: invalidDeviceIds.length }, 200);
});

// Edge Function : clear-conversation
//
// Appelée directement par un participant authentifié (client mobile,
// icône pinceau de l'écran de conversation) pour effacer définitivement
// tous les messages et pièces jointes d'une conversation, pour les DEUX
// participants. Nécessite service_role car un participant ne peut pas
// supprimer les fichiers Storage uploadés par l'AUTRE participant sous
// les policies existantes (storage.objects : uploader_id = auth.uid()
// uniquement) — voir supabase/migrations/20260715140000_create_message_attachments.sql,
// section 6. Même famille de justification que notify-new-message (seule
// autre Edge Function du projet), qui utilise aussi service_role pour une
// opération que le client ne peut pas faire lui-même sous RLS.
//
// Autorisation : n'importe quel participant de la conversation (user_a ou
// user_b), jamais un tiers — vérifié explicitement ci-dessous avant toute
// suppression, la conversation elle-même n'est jamais supprimée (seuls ses
// messages/pièces jointes le sont, la paire d'utilisateurs reste "matchée").
// Idempotente : une conversation déjà vide renvoie un succès avec
// messageCount 0, jamais une erreur.
//
// Ordre de suppression (identique au principe déjà établi pour
// delete_own_message) : fichiers Storage supprimés AVANT les lignes
// messages/message_attachments, pour ne jamais laisser un message affiché
// référencer un fichier absent en cas d'échec partiel.
//
// Aucune fuite dans les journaux : jamais de storage_path, d'URL signée,
// d'UUID de message/pièce jointe, de contenu de message ni de token.

import { createClient } from 'npm:@supabase/supabase-js@2';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type ClearConversationPayload = {
  conversation_id?: unknown;
};

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

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    console.error('[clear-conversation] Configuration serveur manquante.');
    return jsonResponse({ error: 'server_misconfigured' }, 500);
  }

  // Client "anon + Authorization du caller" : seul moyen fiable de valider
  // le JWT de l'utilisateur côté serveur (auth.getUser() le vérifie auprès
  // de Supabase Auth, ne se contente jamais de le décoder localement sans
  // validation de signature).
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return jsonResponse({ error: 'unauthorized' }, 401);
  }
  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const {
    data: { user },
    error: authError,
  } = await callerClient.auth.getUser();
  if (authError || !user) {
    return jsonResponse({ error: 'unauthorized' }, 401);
  }

  let payload: ClearConversationPayload;
  try {
    payload = (await req.json()) as ClearConversationPayload;
  } catch {
    return jsonResponse({ error: 'invalid_body' }, 400);
  }
  if (!isUuid(payload.conversation_id)) {
    return jsonResponse({ error: 'invalid_conversation_id' }, 400);
  }
  const conversationId = payload.conversation_id;

  const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  // 1. Appartenance : uniquement user_a/user_b de CETTE conversation,
  //    jamais un tiers, jamais le rôle owner de l'app (sans rapport avec
  //    une conversation privée 1:1, voir audit préalable).
  const { data: conversation, error: conversationError } = await serviceClient
    .from('conversations')
    .select('id, user_a, user_b')
    .eq('id', conversationId)
    .maybeSingle();

  if (conversationError) {
    console.error('[clear-conversation] Échec de lecture de la conversation.');
    return jsonResponse({ error: 'internal_error' }, 500);
  }
  if (!conversation) {
    return jsonResponse({ error: 'not_found' }, 404);
  }
  if (conversation.user_a !== user.id && conversation.user_b !== user.id) {
    return jsonResponse({ error: 'forbidden' }, 403);
  }

  // 2. Pièces jointes de la conversation (chemins Storage), lues AVANT
  //    toute suppression.
  const { data: attachments, error: attachmentsError } = await serviceClient
    .from('message_attachments')
    .select('storage_path')
    .eq('conversation_id', conversationId);

  if (attachmentsError) {
    console.error('[clear-conversation] Échec de lecture des pièces jointes.');
    return jsonResponse({ error: 'internal_error' }, 500);
  }

  const storagePaths = (attachments ?? []).map((a) => a.storage_path as string).filter(Boolean);

  // 3. Suppression Storage AVANT les lignes DB (voir note d'ordre en tête
  //    de fichier). Un chemin déjà absent n'est jamais une erreur bloquante.
  if (storagePaths.length > 0) {
    const { error: storageError } = await serviceClient.storage.from('chat-media').remove(storagePaths);
    if (storageError) {
      console.error('[clear-conversation] Échec partiel de suppression Storage, poursuite quand même.');
    }
  }

  // 4. Suppression des messages (message_attachments suit par ON DELETE
  //    CASCADE, déjà en place depuis la Phase 4A). La conversation elle-même
  //    n'est jamais supprimée : les deux participants restent "matchés".
  const { data: deletedMessages, error: deleteError } = await serviceClient
    .from('messages')
    .delete()
    .eq('conversation_id', conversationId)
    .select('id');

  if (deleteError) {
    console.error('[clear-conversation] Échec de suppression des messages.');
    return jsonResponse({ error: 'internal_error' }, 500);
  }

  const messageCount = deletedMessages?.length ?? 0;
  console.log(`[clear-conversation] Conversation effacée : ${messageCount} message(s), ${storagePaths.length} fichier(s).`);

  return jsonResponse({ cleared: true, messageCount }, 200);
});

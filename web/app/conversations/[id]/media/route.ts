import { NextResponse, type NextRequest } from 'next/server';

import { ALLOWED_EXTENSIONS, MAX_VIDEO_SIZE_BYTES, MEDIA_HEADER_BYTES_REQUIRED, type AllowedMimeType, type MediaKind } from '@/lib/media-config';
import { validateMediaFileOnServer } from '@/lib/media-server-validation';
import { createClient } from '@/lib/supabase/server';

/**
 * Route d'upload de pièces jointes (Phase 8.5.2) — une seule pièce jointe par
 * requête (Phase 8.5.1). Orchestration stricte : upload Storage d'abord,
 * appel RPC ensuite (jamais l'inverse), nettoyage best-effort si la RPC
 * échoue après un upload réussi. Aucun INSERT direct sur `messages`/
 * `message_attachments` (révoqué pour `authenticated` depuis la Phase 4A) :
 * seules `create_image_message`/`create_video_message` créent quoi que ce
 * soit, réutilisées telles quelles.
 *
 * Réponse toujours générique (voir `MediaUploadResponseBody` ci-dessous) :
 * jamais le détail brut d'une erreur Supabase/Postgres, jamais le chemin
 * Storage complet (le client n'en a jamais besoin — l'affichage, Phase
 * 8.5.4, résoudra l'URL signée côté serveur à partir de l'identifiant du
 * message/de la pièce jointe, jamais en tenant le chemin lui-même).
 */

export type MediaUploadErrorCode = 'invalid_request' | 'invalid_file' | 'unauthorized' | 'upload_failed' | 'send_failed';

export type MediaUploadResponseBody =
  | {
      ok: true;
      message: {
        id: string;
        conversationId: string;
        senderId: string;
        content: string;
        messageType: MediaKind;
        createdAt: string;
      };
      attachment: {
        id: string;
        mediaType: MediaKind;
        mimeType: AllowedMimeType;
        sizeBytes: number;
        width: number | null;
        height: number | null;
        durationMs: number | null;
      };
    }
  | { ok: false; code: MediaUploadErrorCode };

/** Format UUID (v4 ou non — seule la forme est vérifiée ici, pas la version) : la même forme que `crypto.randomUUID()` côté navigateur (Phase 8.5.3). */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Marge au-delà de `MAX_VIDEO_SIZE_BYTES` (le plafond le plus élevé des deux
 * types de média) tolérée pour l'en-tête `Content-Length` avant même de
 * tenter de lire le corps de la requête : couvre le surcoût `multipart/
 * form-data` (limites de partie, en-têtes de champ) autour du fichier lui
 * même, jamais une marge pour un fichier plus gros que la limite réelle.
 */
const MULTIPART_OVERHEAD_BYTES = 64 * 1024;

/** Journalise uniquement une catégorie non sensible — jamais un chemin, un jeton, un identifiant utilisateur ou le détail brut d'une erreur Supabase (même convention que `lib/auth-diagnostics.ts`). */
function logMediaUploadDiagnostic(category: MediaUploadErrorCode | 'success', step: string): void {
  console.error(`[media-upload] category=${category} step=${step}`);
}

function jsonError(code: MediaUploadErrorCode, status: number): NextResponse<MediaUploadResponseBody> {
  return NextResponse.json({ ok: false, code }, { status });
}

/**
 * Verrou applicatif en mémoire (Phase 8.5.2) : une clé d'idempotence fournie
 * par le client (générée une seule fois par tentative d'envoi, réutilisée
 * pour toute nouvelle tentative logiquement identique — double-clic, retry
 * après timeout apparent) est associée à la PREMIÈRE promesse de traitement
 * en cours ; toute requête concurrente ou immédiatement répétée avec la même
 * clé attend et reçoit exactement le même résultat, sans jamais relancer un
 * second upload ni créer un second message.
 *
 * Limite assumée et documentée (voir le rapport de sous-phase) : cette table
 * ne vit qu'en mémoire du processus Node courant — elle protège correctement
 * un serveur de développement à instance unique (l'état actuel du projet,
 * aucun backend distribué en Phase 8), mais ne survivrait pas à un
 * redémarrage ni à plusieurs instances simultanées. Une table dédiée en base
 * serait nécessaire pour une garantie multi-instance ; hors périmètre de
 * cette sous-phase (aucune nouvelle table autorisée ici).
 */
const IDEMPOTENCY_TTL_MS = 5 * 60 * 1000;
const pendingUploads = new Map<string, { promise: Promise<{ status: number; body: MediaUploadResponseBody }>; expiresAt: number }>();

function pruneExpiredIdempotencyEntries(now: number): void {
  for (const [key, entry] of pendingUploads) {
    if (entry.expiresAt < now) pendingUploads.delete(key);
  }
}

function parseOptionalPositiveInt(value: FormDataEntryValue | null): number | null {
  if (value === null || typeof value !== 'string' || value.trim() === '') return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse<MediaUploadResponseBody>> {
  const { id: conversationId } = await params;

  const idempotencyKey = request.headers.get('idempotency-key');
  if (!idempotencyKey || !UUID_PATTERN.test(idempotencyKey)) {
    return jsonError('invalid_request', 400);
  }

  // Limite de taille avant tout traitement complet : un `Content-Length`
  // manifestement excessif est rejeté avant même de lire le corps de la
  // requête (jamais une tentative de parsing `multipart/form-data` pour un
  // envoi déjà hors limite). Si l'en-tête est absent (transfert fragmenté),
  // la vérification réelle reste portée par `validateMediaFileOnServer`
  // une fois la taille effective connue.
  const contentLengthHeader = request.headers.get('content-length');
  if (contentLengthHeader) {
    const contentLength = Number(contentLengthHeader);
    if (Number.isFinite(contentLength) && contentLength > MAX_VIDEO_SIZE_BYTES + MULTIPART_OVERHEAD_BYTES) {
      logMediaUploadDiagnostic('invalid_file', 'content_length_exceeded');
      return jsonError('invalid_file', 400);
    }
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    logMediaUploadDiagnostic('unauthorized', 'no_session');
    return jsonError('unauthorized', 401);
  }

  // Vérification explicite d'appartenance à la conversation, en plus de
  // celle déjà effectuée par create_image_message/create_video_message
  // (défense en profondeur) : évite un upload Storage inutile pour une
  // conversation à laquelle l'utilisateur n'appartient pas. RLS ("Un
  // participant peut voir ses conversations") filtre déjà silencieusement :
  // conversation inexistante et conversation dont l'utilisateur n'est pas
  // membre produisent la même absence de ligne, jamais distinguées ici (même
  // principe anti-énumération que le reste du projet).
  const { data: conversation } = await supabase.from('conversations').select('id').eq('id', conversationId).maybeSingle();
  if (!conversation) {
    logMediaUploadDiagnostic('unauthorized', 'not_a_member');
    return jsonError('unauthorized', 403);
  }

  const dedupeKey = `${user.id}:${idempotencyKey}`;
  const now = Date.now();
  pruneExpiredIdempotencyEntries(now);

  const existing = pendingUploads.get(dedupeKey);
  if (existing) {
    const result = await existing.promise;
    return NextResponse.json(result.body, { status: result.status });
  }

  const processingPromise = processUpload(supabase, request, conversationId, user.id);
  pendingUploads.set(dedupeKey, { promise: processingPromise, expiresAt: now + IDEMPOTENCY_TTL_MS });

  const result = await processingPromise;
  return NextResponse.json(result.body, { status: result.status });
}

type ServerSupabaseClient = Awaited<ReturnType<typeof createClient>>;

async function processUpload(
  supabase: ServerSupabaseClient,
  request: NextRequest,
  conversationId: string,
  uploaderId: string,
): Promise<{ status: number; body: MediaUploadResponseBody }> {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    logMediaUploadDiagnostic('invalid_file', 'form_data_parse_failed');
    return { status: 400, body: { ok: false, code: 'invalid_file' } };
  }

  const file = formData.get('file');
  if (!(file instanceof File)) {
    logMediaUploadDiagnostic('invalid_file', 'missing_file_field');
    return { status: 400, body: { ok: false, code: 'invalid_file' } };
  }

  const caption = typeof formData.get('caption') === 'string' ? (formData.get('caption') as string) : '';
  const width = parseOptionalPositiveInt(formData.get('width'));
  const height = parseOptionalPositiveInt(formData.get('height'));
  const durationMs = parseOptionalPositiveInt(formData.get('durationMs'));

  // Seuls les MEDIA_HEADER_BYTES_REQUIRED premiers octets sont lus pour la
  // vérification de signature — jamais le fichier entier, y compris pour une
  // vidéo de 50 Mo (voir media-server-validation.ts, Phase 8.5.1).
  const headerChunk = await file.slice(0, MEDIA_HEADER_BYTES_REQUIRED).arrayBuffer();

  const validation = validateMediaFileOnServer({
    declaredMimeType: file.type || null,
    originalFilename: file.name || null,
    sizeBytes: file.size,
    header: new Uint8Array(headerChunk),
  });

  if (!validation.ok) {
    logMediaUploadDiagnostic('invalid_file', `validation_${validation.code}`);
    return { status: 400, body: { ok: false, code: 'invalid_file' } };
  }

  if (validation.mediaType === 'video' && durationMs === null) {
    logMediaUploadDiagnostic('invalid_file', 'missing_duration');
    return { status: 400, body: { ok: false, code: 'invalid_file' } };
  }

  // Chemin Storage entièrement déterminé côté serveur : identifiant aléatoire
  // cryptographiquement sûr (crypto.randomUUID(), jamais dérivé d'une valeur
  // client), extension dérivée du type MIME réellement validé (jamais du nom
  // de fichier original, jamais un fragment de ce nom).
  const extension = ALLOWED_EXTENSIONS[validation.mimeType][0];
  const storagePath = `${conversationId}/${uploaderId}/${crypto.randomUUID()}.${extension}`;

  const { error: uploadError } = await supabase.storage.from('chat-media').upload(storagePath, file, {
    contentType: validation.mimeType,
    upsert: false,
  });

  if (uploadError) {
    logMediaUploadDiagnostic('upload_failed', 'storage_upload_error');
    return { status: 502, body: { ok: false, code: 'upload_failed' } };
  }

  const rpcName = validation.mediaType === 'image' ? 'create_image_message' : 'create_video_message';
  const rpcParams =
    validation.mediaType === 'image'
      ? {
          p_conversation_id: conversationId,
          p_storage_path: storagePath,
          p_mime_type: validation.mimeType,
          p_size_bytes: file.size,
          p_width: width,
          p_height: height,
          p_content: caption.trim(),
        }
      : {
          p_conversation_id: conversationId,
          p_storage_path: storagePath,
          p_mime_type: validation.mimeType,
          p_size_bytes: file.size,
          p_duration_ms: durationMs,
          p_width: width,
          p_height: height,
          p_content: caption.trim(),
        };

  const { data, error: rpcError } = await supabase.rpc(rpcName, rpcParams);

  if (rpcError) {
    // Compensation best-effort : le fichier déjà uploadé ne doit jamais
    // rester orphelin si la création du message échoue. Storage et Postgres
    // sont deux systèmes distincts, jamais transactionnels ensemble (voir
    // les migrations 20260715140000/20260715150000) — un échec de cette
    // suppression est journalisé séparément mais ne change jamais la réponse
    // déjà déterminée (envoi impossible), jamais renvoyé au client tel quel.
    const { error: cleanupError } = await supabase.storage.from('chat-media').remove([storagePath]);
    logMediaUploadDiagnostic('send_failed', cleanupError ? 'rpc_failed_cleanup_failed' : 'rpc_failed_cleanup_ok');
    return { status: 500, body: { ok: false, code: 'send_failed' } };
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    const { error: cleanupError } = await supabase.storage.from('chat-media').remove([storagePath]);
    logMediaUploadDiagnostic('send_failed', cleanupError ? 'rpc_empty_cleanup_failed' : 'rpc_empty_cleanup_ok');
    return { status: 500, body: { ok: false, code: 'send_failed' } };
  }

  logMediaUploadDiagnostic('success', validation.mediaType);

  return {
    status: 201,
    body: {
      ok: true,
      message: {
        id: row.message_id,
        conversationId: row.conversation_id,
        senderId: row.sender_id,
        content: row.content,
        messageType: validation.mediaType,
        createdAt: row.created_at,
      },
      attachment: {
        id: row.attachment_id,
        mediaType: validation.mediaType,
        mimeType: validation.mimeType,
        sizeBytes: row.size_bytes,
        width: row.width ?? null,
        height: row.height ?? null,
        durationMs: validation.mediaType === 'video' ? (row.duration_ms ?? null) : null,
      },
    },
  };
}

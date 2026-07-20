/** @jest-environment node */
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { NextRequest } from 'next/server';

import { createClient } from '@/lib/supabase/server';

import { POST } from './route';

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(),
}));

const mockCreateClient = createClient as jest.Mock;

const CONVERSATION_ID = 'c0000000-0000-0000-0000-000000000001';
const UPLOADER_ID = 'u0000000-0000-0000-0000-000000000002';

// Le verrou d'idempotence de la route vit dans une Map au niveau du module
// (voir route.ts), donc partagée entre TOUS les tests de ce fichier (Jest ne
// réinitialise pas les modules entre les `it()` d'un même fichier). Chaque
// test doit donc utiliser sa PROPRE clé, jamais une constante partagée, sous
// peine de recevoir silencieusement le résultat mis en cache d'un test
// précédent au lieu d'exercer son propre scénario.
let idempotencyKeyCounter = 0;
function freshIdempotencyKey(): string {
  idempotencyKeyCounter += 1;
  return `aaaaaaaa-bbbb-4ccc-8ddd-${idempotencyKeyCounter.toString(16).padStart(12, '0')}`;
}

const JPEG_BYTES = [0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 3, 4];
const MP4_BYTES = [0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0, 0, 0, 0, 1, 2, 3, 4];
const WEBM_BYTES = [0x1a, 0x45, 0xdf, 0xa3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 3, 4];
const GARBAGE_BYTES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16];

function makeFile(bytes: number[], name: string, type: string): File {
  return new File([new Uint8Array(bytes)], name, { type });
}

function buildFormData(file: File, extra: Record<string, string> = {}): FormData {
  const formData = new FormData();
  formData.set('file', file);
  for (const [key, value] of Object.entries(extra)) formData.set(key, value);
  return formData;
}

function buildRequest(formData: FormData, idempotencyKey: string = freshIdempotencyKey()): NextRequest {
  return new NextRequest(`https://white-alpha.example/conversations/${CONVERSATION_ID}/media`, {
    method: 'POST',
    headers: { 'idempotency-key': idempotencyKey },
    body: formData,
  });
}

function callRoute(request: NextRequest) {
  return POST(request, { params: Promise.resolve({ id: CONVERSATION_ID }) });
}

type MockClientOptions = {
  authenticated?: boolean;
  isMember?: boolean;
  uploadError?: { message: string } | null;
  removeError?: { message: string } | null;
  rpcError?: { message: string } | null;
  rpcRow?: Record<string, unknown> | null;
};

function buildMockClient(options: MockClientOptions = {}) {
  const {
    authenticated = true,
    isMember = true,
    uploadError = null,
    removeError = null,
    rpcError = null,
    rpcRow = {
      message_id: 'm1',
      conversation_id: CONVERSATION_ID,
      sender_id: UPLOADER_ID,
      content: '',
      created_at: '2026-01-01T00:00:00Z',
      attachment_id: 'a1',
      size_bytes: 20,
      width: null,
      height: null,
      duration_ms: null,
    },
  } = options;

  const mockUpload = jest.fn().mockResolvedValue({ error: uploadError });
  const mockRemove = jest.fn().mockResolvedValue({ error: removeError });
  const mockRpc = jest.fn().mockResolvedValue({ data: rpcError ? null : rpcRow, error: rpcError });
  const mockGetUser = jest.fn().mockResolvedValue({ data: { user: authenticated ? { id: UPLOADER_ID } : null } });
  const mockMaybeSingle = jest.fn().mockResolvedValue({ data: isMember ? { id: CONVERSATION_ID } : null });
  const mockEq = jest.fn().mockReturnValue({ maybeSingle: mockMaybeSingle });
  const mockSelect = jest.fn().mockReturnValue({ eq: mockEq });
  const mockFrom = jest.fn().mockReturnValue({ select: mockSelect });
  const mockStorageFrom = jest.fn().mockReturnValue({ upload: mockUpload, remove: mockRemove });

  return {
    auth: { getUser: mockGetUser },
    from: mockFrom,
    storage: { from: mockStorageFrom },
    rpc: mockRpc,
    __mocks: { mockUpload, mockRemove, mockRpc, mockGetUser, mockFrom, mockMaybeSingle, mockStorageFrom },
  };
}

describe('POST /conversations/[id]/media (Phase 8.5.2)', () => {
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockCreateClient.mockReset();
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('image JPEG valide : upload puis message créé', async () => {
    const client = buildMockClient();
    mockCreateClient.mockResolvedValue(client);

    const response = await callRoute(buildRequest(buildFormData(makeFile(JPEG_BYTES, 'photo.jpg', 'image/jpeg'))));
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body).toEqual({
      ok: true,
      message: expect.objectContaining({ id: 'm1', messageType: 'image' }),
      attachment: expect.objectContaining({ id: 'a1', mediaType: 'image', mimeType: 'image/jpeg' }),
    });
    expect(client.__mocks.mockUpload).toHaveBeenCalledTimes(1);
    expect(client.__mocks.mockRpc).toHaveBeenCalledWith('create_image_message', expect.objectContaining({ p_conversation_id: CONVERSATION_ID }));
  });

  it('vidéo MP4 valide : upload puis message créé', async () => {
    const client = buildMockClient();
    mockCreateClient.mockResolvedValue(client);

    const response = await callRoute(buildRequest(buildFormData(makeFile(MP4_BYTES, 'video.mp4', 'video/mp4'), { durationMs: '5000' })));
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.ok).toBe(true);
    expect(client.__mocks.mockRpc).toHaveBeenCalledWith('create_video_message', expect.objectContaining({ p_duration_ms: 5000 }));
  });

  it('vidéo WebM valide : upload puis message créé', async () => {
    const client = buildMockClient();
    mockCreateClient.mockResolvedValue(client);

    const response = await callRoute(buildRequest(buildFormData(makeFile(WEBM_BYTES, 'video.webm', 'video/webm'), { durationMs: '3000' })));
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.ok).toBe(true);
    expect(client.__mocks.mockRpc).toHaveBeenCalledWith('create_video_message', expect.objectContaining({ p_duration_ms: 3000 }));
  });

  it('utilisateur non authentifié : refusé, jamais de vérification de conversation ni d’upload', async () => {
    const client = buildMockClient({ authenticated: false });
    mockCreateClient.mockResolvedValue(client);

    const response = await callRoute(buildRequest(buildFormData(makeFile(JPEG_BYTES, 'photo.jpg', 'image/jpeg'))));
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toEqual({ ok: false, code: 'unauthorized' });
    expect(client.__mocks.mockFrom).not.toHaveBeenCalled();
    expect(client.__mocks.mockUpload).not.toHaveBeenCalled();
  });

  it('utilisateur non membre de la conversation : refusé, jamais d’upload', async () => {
    const client = buildMockClient({ isMember: false });
    mockCreateClient.mockResolvedValue(client);

    const response = await callRoute(buildRequest(buildFormData(makeFile(JPEG_BYTES, 'photo.jpg', 'image/jpeg'))));
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body).toEqual({ ok: false, code: 'unauthorized' });
    expect(client.__mocks.mockUpload).not.toHaveBeenCalled();
  });

  it('conversation inexistante : refusé avec la même réponse générique qu’un non-membre (anti-énumération)', async () => {
    // Même chemin de code que le test précédent : `maybeSingle()` renvoie
    // `null` aussi bien pour une conversation inexistante que pour une
    // conversation dont l'utilisateur n'est pas membre — jamais distingué,
    // même principe que le reste du projet (voir get_conversation_for_notification).
    const client = buildMockClient({ isMember: false });
    mockCreateClient.mockResolvedValue(client);

    const response = await callRoute(buildRequest(buildFormData(makeFile(JPEG_BYTES, 'photo.jpg', 'image/jpeg'))));
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body).toEqual({ ok: false, code: 'unauthorized' });
  });

  it('fichier invalide (signature ne correspond pas au type déclaré) : refusé avant tout upload Storage', async () => {
    const client = buildMockClient();
    mockCreateClient.mockResolvedValue(client);

    const response = await callRoute(buildRequest(buildFormData(makeFile(GARBAGE_BYTES, 'photo.jpg', 'image/jpeg'))));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({ ok: false, code: 'invalid_file' });
    expect(client.__mocks.mockUpload).not.toHaveBeenCalled();
    expect(client.__mocks.mockRpc).not.toHaveBeenCalled();
  });

  it('image trop volumineuse (> 10 Mo) : refusée avant tout upload Storage', async () => {
    const client = buildMockClient();
    mockCreateClient.mockResolvedValue(client);

    const oversized = new Uint8Array(10 * 1024 * 1024 + 1);
    oversized.set(JPEG_BYTES, 0);
    const file = new File([oversized], 'photo.jpg', { type: 'image/jpeg' });

    const response = await callRoute(buildRequest(buildFormData(file)));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({ ok: false, code: 'invalid_file' });
    expect(client.__mocks.mockUpload).not.toHaveBeenCalled();
  });

  it('vidéo trop volumineuse (> 50 Mo) : refusée avant tout upload Storage — la limite métier reste 50 Mo malgré proxyClientMaxBodySize=60mb (Phase 8.5.5)', async () => {
    const client = buildMockClient();
    mockCreateClient.mockResolvedValue(client);

    const oversized = new Uint8Array(50 * 1024 * 1024 + 1);
    oversized.set(MP4_BYTES, 0);
    const file = new File([oversized], 'video.mp4', { type: 'video/mp4' });

    const response = await callRoute(
      buildRequest(buildFormData(file, { durationMs: '5000' })),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({ ok: false, code: 'invalid_file' });
    expect(client.__mocks.mockUpload).not.toHaveBeenCalled();
  });

  it('échec de l’upload Storage : aucune RPC appelée', async () => {
    const client = buildMockClient({ uploadError: { message: 'network boom' } });
    mockCreateClient.mockResolvedValue(client);

    const response = await callRoute(buildRequest(buildFormData(makeFile(JPEG_BYTES, 'photo.jpg', 'image/jpeg'))));
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body).toEqual({ ok: false, code: 'upload_failed' });
    expect(client.__mocks.mockRpc).not.toHaveBeenCalled();
  });

  it('upload réussi puis RPC en échec : suppression Storage tentée avec le même chemin', async () => {
    const client = buildMockClient({ rpcError: { message: 'Conversation introuvable.' } });
    mockCreateClient.mockResolvedValue(client);

    const response = await callRoute(buildRequest(buildFormData(makeFile(JPEG_BYTES, 'photo.jpg', 'image/jpeg'))));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({ ok: false, code: 'send_failed' });
    expect(client.__mocks.mockRemove).toHaveBeenCalledTimes(1);

    const uploadedPath = client.__mocks.mockUpload.mock.calls[0]?.[0];
    const removedPaths = client.__mocks.mockRemove.mock.calls[0]?.[0];
    expect(removedPaths).toEqual([uploadedPath]);
  });

  it('suppression Storage elle-même en échec après une RPC en échec : erreur contrôlée, sans fuite', async () => {
    const client = buildMockClient({ rpcError: { message: 'boom' }, removeError: { message: 'boom aussi' } });
    mockCreateClient.mockResolvedValue(client);

    const response = await callRoute(buildRequest(buildFormData(makeFile(JPEG_BYTES, 'photo.jpg', 'image/jpeg'))));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({ ok: false, code: 'send_failed' });
    expect(client.__mocks.mockRemove).toHaveBeenCalledTimes(1);
  });

  it('double soumission avec la même clé d’idempotence : un seul upload et un seul appel RPC', async () => {
    const client = buildMockClient();
    mockCreateClient.mockResolvedValue(client);
    const sharedKey = freshIdempotencyKey();

    const [responseA, responseB] = await Promise.all([
      callRoute(buildRequest(buildFormData(makeFile(JPEG_BYTES, 'photo.jpg', 'image/jpeg')), sharedKey)),
      callRoute(buildRequest(buildFormData(makeFile(JPEG_BYTES, 'photo.jpg', 'image/jpeg')), sharedKey)),
    ]);

    expect(client.__mocks.mockUpload).toHaveBeenCalledTimes(1);
    expect(client.__mocks.mockRpc).toHaveBeenCalledTimes(1);

    const bodyA = await responseA.json();
    const bodyB = await responseB.json();
    expect(bodyA).toEqual(bodyB);
  });

  it('deux clés d’idempotence différentes : deux uploads distincts (pas une fausse déduplication)', async () => {
    const client = buildMockClient();
    mockCreateClient.mockResolvedValue(client);

    await callRoute(buildRequest(buildFormData(makeFile(JPEG_BYTES, 'photo.jpg', 'image/jpeg')), freshIdempotencyKey()));
    await callRoute(buildRequest(buildFormData(makeFile(JPEG_BYTES, 'photo.jpg', 'image/jpeg')), freshIdempotencyKey()));

    expect(client.__mocks.mockUpload).toHaveBeenCalledTimes(2);
    expect(client.__mocks.mockRpc).toHaveBeenCalledTimes(2);
  });

  it('clé d’idempotence absente ou malformée : requête refusée avant toute authentification/upload', async () => {
    const client = buildMockClient();
    mockCreateClient.mockResolvedValue(client);

    const request = new NextRequest(`https://white-alpha.example/conversations/${CONVERSATION_ID}/media`, {
      method: 'POST',
      body: buildFormData(makeFile(JPEG_BYTES, 'photo.jpg', 'image/jpeg')),
    });

    const response = await callRoute(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({ ok: false, code: 'invalid_request' });
    expect(client.__mocks.mockGetUser).not.toHaveBeenCalled();
    expect(client.__mocks.mockUpload).not.toHaveBeenCalled();
  });

  it('aucun chemin Storage, token ou détail brut dans la réponse ou les logs (scénario d’échec)', async () => {
    const client = buildMockClient({ rpcError: { message: 'DÉTAIL SQL SENSIBLE INTERNE' } });
    mockCreateClient.mockResolvedValue(client);

    const response = await callRoute(buildRequest(buildFormData(makeFile(JPEG_BYTES, 'photo.jpg', 'image/jpeg'))));
    const body = await response.json();
    const rawBody = JSON.stringify(body);

    expect(Object.keys(body).sort()).toEqual(['code', 'ok']);
    expect(rawBody).not.toContain('DÉTAIL SQL SENSIBLE INTERNE');
    expect(rawBody).not.toContain(CONVERSATION_ID);
    expect(rawBody).not.toContain(UPLOADER_ID);

    const loggedLines = consoleErrorSpy.mock.calls.map((call) => String(call[0]));
    for (const line of loggedLines) {
      expect(line).not.toContain('DÉTAIL SQL SENSIBLE INTERNE');
      expect(line).not.toContain(CONVERSATION_ID);
      expect(line).not.toContain(UPLOADER_ID);
      expect(line).toMatch(/^\[media-upload\] category=\S+ step=\S+$/);
    }
  });

  it('aucune référence à service_role dans le fichier de route (jamais côté serveur applicatif Web non plus)', () => {
    const source = readFileSync(path.join(__dirname, 'route.ts'), 'utf8');
    expect(source.toLowerCase()).not.toContain('service_role');
    expect(source).not.toContain('SUPABASE_SERVICE_ROLE');
  });

  it('aucun INSERT direct sur messages ou message_attachments dans le fichier de route', () => {
    const source = readFileSync(path.join(__dirname, 'route.ts'), 'utf8');
    expect(source).not.toMatch(/\.from\(\s*['"]messages['"]\s*\)\s*\.\s*insert/);
    expect(source).not.toMatch(/\.from\(\s*['"]message_attachments['"]\s*\)\s*\.\s*insert/);
  });
});

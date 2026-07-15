import { supabase } from '@/lib/supabase';
import { deleteMessage, fetchMessageById, fetchMessages, sendImageMessage, sendMessage, sendVideoMessage } from '@/services/messages';
import { MESSAGE_MAX_LENGTH } from '@/types/chat';

jest.mock('@/lib/supabase', () => ({
  supabase: { from: jest.fn(), rpc: jest.fn() },
}));

const mockFrom = supabase.from as jest.Mock;
const mockRpc = supabase.rpc as jest.Mock;

describe('sendMessage', () => {
  beforeEach(() => {
    mockRpc.mockReset();
  });

  it('rejette un message vide sans interroger la base', async () => {
    await expect(sendMessage('conv-1', '   ')).rejects.toThrow('vide');
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('rejette un message de plus de 4000 caractères sans interroger la base', async () => {
    const tooLong = 'a'.repeat(MESSAGE_MAX_LENGTH + 1);
    await expect(sendMessage('conv-1', tooLong)).rejects.toThrow('4000');
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('appelle la RPC create_text_message (aucun INSERT direct) et retourne le message mappé', async () => {
    mockRpc.mockResolvedValue({
      data: [
        {
          message_id: 'm1',
          conversation_id: 'conv-1',
          sender_id: 'user-1',
          content: 'Salut',
          created_at: '2026-07-15T10:00:00Z',
        },
      ],
      error: null,
    });

    const result = await sendMessage('conv-1', 'Salut');

    expect(mockRpc).toHaveBeenCalledWith('create_text_message', { p_conversation_id: 'conv-1', p_content: 'Salut' });
    expect(result).toEqual({
      id: 'm1',
      conversationId: 'conv-1',
      senderId: 'user-1',
      content: 'Salut',
      createdAt: '2026-07-15T10:00:00Z',
      attachment: null,
    });
  });

  it("remonte une erreur (ex. RLS/RPC) sous forme d'exception", async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'Conversation introuvable.' } });

    await expect(sendMessage('conv-1', 'Salut')).rejects.toThrow('Conversation introuvable.');
  });

  it("ne passe jamais sender_id en paramètre (uniquement conversation_id et content)", async () => {
    mockRpc.mockResolvedValue({
      data: [{ message_id: 'm1', conversation_id: 'conv-1', sender_id: 'user-1', content: 'Salut', created_at: 't' }],
      error: null,
    });

    await sendMessage('conv-1', 'Salut');

    const params = mockRpc.mock.calls[0][1];
    expect(Object.keys(params).sort()).toEqual(['p_content', 'p_conversation_id'].sort());
  });
});

describe('fetchMessages', () => {
  beforeEach(() => {
    mockFrom.mockReset();
  });

  it("remonte une erreur réseau sous forme d'exception", async () => {
    const limit = jest.fn().mockResolvedValue({ data: null, error: { message: 'network down' } });
    const order = jest.fn().mockReturnValue({ limit });
    const eq = jest.fn().mockReturnValue({ order });
    const select = jest.fn().mockReturnValue({ eq });
    mockFrom.mockReturnValue({ select });

    await expect(fetchMessages('conv-1')).rejects.toThrow('Impossible de charger les messages');
  });

  it('mappe la pièce jointe embarquée dans message_attachments', async () => {
    const limit = jest.fn().mockResolvedValue({
      data: [
        {
          id: 'm1',
          conversation_id: 'conv-1',
          sender_id: 'user-1',
          content: '',
          created_at: '2026-07-15T10:00:00Z',
          message_attachments: [
            {
              id: 'att-1',
              storage_path: 'conv-1/user-1/abc.jpg',
              mime_type: 'image/jpeg',
              size_bytes: 12345,
              width: 800,
              height: 600,
              uploader_id: 'user-1',
              created_at: '2026-07-15T10:00:00Z',
            },
          ],
        },
      ],
      error: null,
    });
    const order = jest.fn().mockReturnValue({ limit });
    const eq = jest.fn().mockReturnValue({ order });
    const select = jest.fn().mockReturnValue({ eq });
    mockFrom.mockReturnValue({ select });

    const [message] = await fetchMessages('conv-1');

    expect(message.attachment).toEqual({
      id: 'att-1',
      messageId: 'm1',
      conversationId: 'conv-1',
      uploaderId: 'user-1',
      mediaType: 'image',
      storagePath: 'conv-1/user-1/abc.jpg',
      mimeType: 'image/jpeg',
      sizeBytes: 12345,
      width: 800,
      height: 600,
      createdAt: '2026-07-15T10:00:00Z',
    });
  });

  it('mappe une pièce jointe vidéo (media_type video) avec sa durée', async () => {
    const limit = jest.fn().mockResolvedValue({
      data: [
        {
          id: 'm1',
          conversation_id: 'conv-1',
          sender_id: 'user-1',
          content: '',
          created_at: '2026-07-15T10:00:00Z',
          message_attachments: [
            {
              id: 'att-1',
              storage_path: 'conv-1/user-1/clip.mp4',
              media_type: 'video',
              mime_type: 'video/mp4',
              size_bytes: 2_000_000,
              width: 1280,
              height: 720,
              duration_ms: 15_000,
              uploader_id: 'user-1',
              created_at: '2026-07-15T10:00:00Z',
            },
          ],
        },
      ],
      error: null,
    });
    const order = jest.fn().mockReturnValue({ limit });
    const eq = jest.fn().mockReturnValue({ order });
    const select = jest.fn().mockReturnValue({ eq });
    mockFrom.mockReturnValue({ select });

    const [message] = await fetchMessages('conv-1');

    expect(message.attachment).toEqual({
      id: 'att-1',
      messageId: 'm1',
      conversationId: 'conv-1',
      uploaderId: 'user-1',
      mediaType: 'video',
      storagePath: 'conv-1/user-1/clip.mp4',
      mimeType: 'video/mp4',
      sizeBytes: 2_000_000,
      durationMs: 15_000,
      width: 1280,
      height: 720,
      createdAt: '2026-07-15T10:00:00Z',
    });
  });
});

describe('sendImageMessage', () => {
  beforeEach(() => {
    mockRpc.mockReset();
  });

  it("crée un message photo via la RPC create_image_message et retourne le message avec sa pièce jointe", async () => {
    mockRpc.mockResolvedValue({
      data: [
        {
          message_id: 'm1',
          conversation_id: 'conv-1',
          sender_id: 'user-1',
          content: '',
          created_at: '2026-07-15T10:00:00Z',
          attachment_id: 'att-1',
          storage_path: 'conv-1/user-1/abc.jpg',
          mime_type: 'image/jpeg',
          size_bytes: 12345,
          width: 800,
          height: 600,
        },
      ],
      error: null,
    });

    const result = await sendImageMessage({
      conversationId: 'conv-1',
      storagePath: 'conv-1/user-1/abc.jpg',
      mimeType: 'image/jpeg',
      sizeBytes: 12345,
      width: 800,
      height: 600,
    });

    expect(mockRpc).toHaveBeenCalledWith('create_image_message', {
      p_conversation_id: 'conv-1',
      p_storage_path: 'conv-1/user-1/abc.jpg',
      p_mime_type: 'image/jpeg',
      p_size_bytes: 12345,
      p_width: 800,
      p_height: 600,
      p_content: '',
    });
    expect(result).toEqual({
      id: 'm1',
      conversationId: 'conv-1',
      senderId: 'user-1',
      content: '',
      createdAt: '2026-07-15T10:00:00Z',
      attachment: {
        id: 'att-1',
        messageId: 'm1',
        conversationId: 'conv-1',
        uploaderId: 'user-1',
        mediaType: 'image',
        storagePath: 'conv-1/user-1/abc.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: 12345,
        width: 800,
        height: 600,
        createdAt: '2026-07-15T10:00:00Z',
      },
    });
  });

  it("ne contient jamais d'URL signée dans les paramètres envoyés à la RPC (seulement storage_path)", async () => {
    mockRpc.mockResolvedValue({
      data: [
        {
          message_id: 'm1',
          conversation_id: 'conv-1',
          sender_id: 'user-1',
          content: '',
          created_at: '2026-07-15T10:00:00Z',
          attachment_id: 'att-1',
          storage_path: 'conv-1/user-1/abc.jpg',
          mime_type: 'image/jpeg',
          size_bytes: 12345,
          width: null,
          height: null,
        },
      ],
      error: null,
    });

    await sendImageMessage({
      conversationId: 'conv-1',
      storagePath: 'conv-1/user-1/abc.jpg',
      mimeType: 'image/jpeg',
      sizeBytes: 12345,
    });

    const params = mockRpc.mock.calls[0][1];
    expect(Object.keys(params).sort()).toEqual(
      ['p_content', 'p_conversation_id', 'p_height', 'p_mime_type', 'p_size_bytes', 'p_storage_path', 'p_width'].sort(),
    );
  });

  it("remonte une erreur (ex. utilisateur non membre de la conversation) sous forme d'exception", async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'Conversation introuvable.' } });

    await expect(
      sendImageMessage({
        conversationId: 'conv-1',
        storagePath: 'conv-1/user-1/abc.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: 12345,
      }),
    ).rejects.toThrow('Conversation introuvable.');
  });
});

describe('sendVideoMessage', () => {
  beforeEach(() => {
    mockRpc.mockReset();
  });

  it("crée un message vidéo via la RPC create_video_message et retourne le message avec sa pièce jointe", async () => {
    mockRpc.mockResolvedValue({
      data: [
        {
          message_id: 'm1',
          conversation_id: 'conv-1',
          sender_id: 'user-1',
          content: '',
          created_at: '2026-07-15T10:00:00Z',
          attachment_id: 'att-1',
          storage_path: 'conv-1/user-1/clip.mp4',
          mime_type: 'video/mp4',
          size_bytes: 2_000_000,
          duration_ms: 15_000,
          width: 1280,
          height: 720,
        },
      ],
      error: null,
    });

    const result = await sendVideoMessage({
      conversationId: 'conv-1',
      storagePath: 'conv-1/user-1/clip.mp4',
      mimeType: 'video/mp4',
      sizeBytes: 2_000_000,
      durationMs: 15_000,
      width: 1280,
      height: 720,
    });

    expect(mockRpc).toHaveBeenCalledWith('create_video_message', {
      p_conversation_id: 'conv-1',
      p_storage_path: 'conv-1/user-1/clip.mp4',
      p_mime_type: 'video/mp4',
      p_size_bytes: 2_000_000,
      p_duration_ms: 15_000,
      p_width: 1280,
      p_height: 720,
      p_content: '',
    });
    expect(result).toEqual({
      id: 'm1',
      conversationId: 'conv-1',
      senderId: 'user-1',
      content: '',
      createdAt: '2026-07-15T10:00:00Z',
      attachment: {
        id: 'att-1',
        messageId: 'm1',
        conversationId: 'conv-1',
        uploaderId: 'user-1',
        mediaType: 'video',
        storagePath: 'conv-1/user-1/clip.mp4',
        mimeType: 'video/mp4',
        sizeBytes: 2_000_000,
        durationMs: 15_000,
        width: 1280,
        height: 720,
        createdAt: '2026-07-15T10:00:00Z',
      },
    });
  });

  it("ne contient jamais d'URL signée dans les paramètres envoyés à la RPC (seulement storage_path)", async () => {
    mockRpc.mockResolvedValue({
      data: [
        {
          message_id: 'm1',
          conversation_id: 'conv-1',
          sender_id: 'user-1',
          content: '',
          created_at: '2026-07-15T10:00:00Z',
          attachment_id: 'att-1',
          storage_path: 'conv-1/user-1/clip.mp4',
          mime_type: 'video/mp4',
          size_bytes: 2_000_000,
          duration_ms: 15_000,
          width: null,
          height: null,
        },
      ],
      error: null,
    });

    await sendVideoMessage({
      conversationId: 'conv-1',
      storagePath: 'conv-1/user-1/clip.mp4',
      mimeType: 'video/mp4',
      sizeBytes: 2_000_000,
      durationMs: 15_000,
    });

    const params = mockRpc.mock.calls[0][1];
    expect(Object.keys(params).sort()).toEqual(
      ['p_content', 'p_conversation_id', 'p_duration_ms', 'p_height', 'p_mime_type', 'p_size_bytes', 'p_storage_path', 'p_width'].sort(),
    );
  });

  it("remonte une erreur (ex. utilisateur non membre de la conversation) sous forme d'exception", async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'Conversation introuvable.' } });

    await expect(
      sendVideoMessage({
        conversationId: 'conv-1',
        storagePath: 'conv-1/user-1/clip.mp4',
        mimeType: 'video/mp4',
        sizeBytes: 2_000_000,
        durationMs: 15_000,
      }),
    ).rejects.toThrow('Conversation introuvable.');
  });
});

describe('fetchMessageById', () => {
  beforeEach(() => {
    mockFrom.mockReset();
  });

  it('retourne null quand le message est introuvable (ou inaccessible via RLS)', async () => {
    const maybeSingle = jest.fn().mockResolvedValue({ data: null, error: null });
    const eq = jest.fn().mockReturnValue({ maybeSingle });
    const select = jest.fn().mockReturnValue({ eq });
    mockFrom.mockReturnValue({ select });

    await expect(fetchMessageById('missing')).resolves.toBeNull();
  });

  it('remonte une erreur française en cas d’échec réseau', async () => {
    const maybeSingle = jest.fn().mockResolvedValue({ data: null, error: { message: 'network down' } });
    const eq = jest.fn().mockReturnValue({ maybeSingle });
    const select = jest.fn().mockReturnValue({ eq });
    mockFrom.mockReturnValue({ select });

    await expect(fetchMessageById('m1')).rejects.toThrow('Impossible de charger le message');
  });
});

describe('deleteMessage', () => {
  beforeEach(() => {
    mockFrom.mockReset();
  });

  it('supprime le message par son id', async () => {
    const eq = jest.fn().mockResolvedValue({ error: null });
    const del = jest.fn().mockReturnValue({ eq });
    mockFrom.mockReturnValue({ delete: del });

    await deleteMessage('m1');

    expect(mockFrom).toHaveBeenCalledWith('messages');
    expect(eq).toHaveBeenCalledWith('id', 'm1');
  });

  it('remonte une erreur française en cas d’échec', async () => {
    const eq = jest.fn().mockResolvedValue({ error: { message: 'denied' } });
    const del = jest.fn().mockReturnValue({ eq });
    mockFrom.mockReturnValue({ delete: del });

    await expect(deleteMessage('m1')).rejects.toThrow('Impossible de supprimer le message');
  });
});

describe('Message et MessageAttachment ne contiennent jamais de champ email ni de secret', () => {
  it('la forme du message texte mappé est exactement celle attendue (aucun champ additionnel type email/clé)', async () => {
    mockRpc.mockResolvedValue({
      data: [{ message_id: 'm1', conversation_id: 'conv-1', sender_id: 'user-1', content: 'Salut', created_at: 't' }],
      error: null,
    });

    const result = await sendMessage('conv-1', 'Salut');

    expect(Object.keys(result).sort()).toEqual(
      ['id', 'conversationId', 'senderId', 'content', 'createdAt', 'attachment'].sort(),
    );
  });

  it('la forme du message photo mappé (avec pièce jointe) est exactement celle attendue', async () => {
    mockRpc.mockResolvedValue({
      data: [
        {
          message_id: 'm1',
          conversation_id: 'conv-1',
          sender_id: 'user-1',
          content: '',
          created_at: '2026-07-15T10:00:00Z',
          attachment_id: 'att-1',
          storage_path: 'conv-1/user-1/abc.jpg',
          mime_type: 'image/jpeg',
          size_bytes: 1,
          width: null,
          height: null,
        },
      ],
      error: null,
    });

    const result = await sendImageMessage({
      conversationId: 'conv-1',
      storagePath: 'conv-1/user-1/abc.jpg',
      mimeType: 'image/jpeg',
      sizeBytes: 1,
    });

    expect(Object.keys(result).sort()).toEqual(
      ['id', 'conversationId', 'senderId', 'content', 'createdAt', 'attachment'].sort(),
    );
    expect(Object.keys(result.attachment!).sort()).toEqual(
      [
        'id',
        'messageId',
        'conversationId',
        'uploaderId',
        'mediaType',
        'storagePath',
        'mimeType',
        'sizeBytes',
        'width',
        'height',
        'createdAt',
      ].sort(),
    );
  });

  it('la forme du message vidéo mappé (avec pièce jointe) est exactement celle attendue (aucune URL, aucun jeton)', async () => {
    mockRpc.mockResolvedValue({
      data: [
        {
          message_id: 'm1',
          conversation_id: 'conv-1',
          sender_id: 'user-1',
          content: '',
          created_at: '2026-07-15T10:00:00Z',
          attachment_id: 'att-1',
          storage_path: 'conv-1/user-1/clip.mp4',
          mime_type: 'video/mp4',
          size_bytes: 1,
          duration_ms: 1000,
          width: null,
          height: null,
        },
      ],
      error: null,
    });

    const result = await sendVideoMessage({
      conversationId: 'conv-1',
      storagePath: 'conv-1/user-1/clip.mp4',
      mimeType: 'video/mp4',
      sizeBytes: 1,
      durationMs: 1000,
    });

    expect(Object.keys(result).sort()).toEqual(
      ['id', 'conversationId', 'senderId', 'content', 'createdAt', 'attachment'].sort(),
    );
    expect(Object.keys(result.attachment!).sort()).toEqual(
      [
        'id',
        'messageId',
        'conversationId',
        'uploaderId',
        'mediaType',
        'storagePath',
        'mimeType',
        'sizeBytes',
        'durationMs',
        'width',
        'height',
        'createdAt',
      ].sort(),
    );
  });
});

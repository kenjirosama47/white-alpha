import { supabase } from '@/lib/supabase';
import {
  clearConversation,
  getConversationForNotification,
  getOrCreateConversation,
  listConversations,
} from '@/services/conversations';

jest.mock('@/lib/supabase', () => ({
  supabase: { rpc: jest.fn(), storage: { from: jest.fn() }, functions: { invoke: jest.fn() } },
}));

const mockRpc = supabase.rpc as jest.Mock;
const mockStorageFrom = supabase.storage.from as jest.Mock;
const mockFunctionsInvoke = supabase.functions.invoke as jest.Mock;

beforeEach(() => {
  mockStorageFrom.mockReturnValue({
    getPublicUrl: (path: string) => ({ data: { publicUrl: `https://cdn.test/avatars/${path}` } }),
  });
});

describe('getOrCreateConversation', () => {
  beforeEach(() => {
    mockRpc.mockReset();
  });

  it('crée ou réutilise une conversation et retourne son id', async () => {
    mockRpc.mockResolvedValue({ data: 'conv-123', error: null });

    const id = await getOrCreateConversation('user-b');

    expect(mockRpc).toHaveBeenCalledWith('get_or_create_direct_conversation', {
      target_user_id: 'user-b',
    });
    expect(id).toBe('conv-123');
  });

  it("remonte le message d'une exception volontaire de la RPC (SQLSTATE P0001) quand la création est refusée", async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { code: 'P0001', message: 'Impossible de créer une conversation avec soi-même.' },
    });

    await expect(getOrCreateConversation('self')).rejects.toThrow('soi-même');
  });

  it("ne laisse jamais fuir un message technique brut (pas de SQLSTATE P0001) : message français générique à la place", async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'Network error' } });

    await expect(getOrCreateConversation('user-b')).rejects.toThrow(
      'Impossible de créer la conversation pour le moment.',
    );
  });
});

describe('listConversations', () => {
  beforeEach(() => {
    mockRpc.mockReset();
  });

  it('mappe les lignes retournées par la RPC list_my_conversations', async () => {
    mockRpc.mockResolvedValue({
      data: [
        {
          conversation_id: 'c1',
          other_user_id: 'u2',
          other_username: 'bob',
          other_display_name: 'Bob',
          other_avatar_url: null,
          other_avatar_preset: 'wolf_grey',
          last_message_content: 'Salut',
          last_message_created_at: '2026-07-15T10:00:00Z',
        },
      ],
      error: null,
    });

    const result = await listConversations();

    expect(result).toEqual([
      {
        conversationId: 'c1',
        otherParticipant: { id: 'u2', username: 'bob', displayName: 'Bob', avatarUrl: null, avatarPreset: 'wolf_grey' },
        lastMessageContent: 'Salut',
        lastMessageCreatedAt: '2026-07-15T10:00:00Z',
      },
    ]);
  });

  it('retourne une liste vide quand data est null', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });

    const result = await listConversations();

    expect(result).toEqual([]);
  });

  it('convertit other_avatar_url (chemin Storage) en URL publique prête à afficher', async () => {
    mockRpc.mockResolvedValue({
      data: [
        {
          conversation_id: 'c1',
          other_user_id: 'u2',
          other_username: 'bob',
          other_display_name: 'Bob',
          other_avatar_url: 'u2/abc.jpg',
          last_message_content: 'Salut',
          last_message_created_at: '2026-07-15T10:00:00Z',
        },
      ],
      error: null,
    });

    const result = await listConversations();

    expect(mockStorageFrom).toHaveBeenCalledWith('avatars');
    expect(result[0].otherParticipant.avatarUrl).toBe('https://cdn.test/avatars/u2/abc.jpg');
  });
});

describe('getConversationForNotification', () => {
  beforeEach(() => {
    mockRpc.mockReset();
  });

  it("revalide l'appartenance via la RPC dédiée et mappe la ligne retournée, avatar_preset inclus", async () => {
    mockRpc.mockResolvedValue({
      data: [
        {
          conversation_id: 'c1',
          other_user_id: 'u2',
          other_username: 'bob',
          other_display_name: 'Bob',
          other_avatar_url: null,
          other_avatar_preset: 'wolf_alpha',
        },
      ],
      error: null,
    });

    const result = await getConversationForNotification('c1');

    expect(mockRpc).toHaveBeenCalledWith('get_conversation_for_notification', { p_conversation_id: 'c1' });
    // Depuis la migration 20260718090000 (Anomalie 1, build 16) :
    // get_conversation_for_notification renvoie le véritable avatar_preset de
    // l'autre participant, jamais un repli codé en dur.
    expect(result).toEqual({
      conversationId: 'c1',
      id: 'u2',
      username: 'bob',
      displayName: 'Bob',
      avatarUrl: null,
      avatarPreset: 'wolf_alpha',
    });
  });

  it(
    "n'expose aucun champ sensible : la migration 20260718090000 n'ajoute que other_avatar_preset, " +
      'jamais email/role/owner/MFA/token (validation section 2/4)',
    async () => {
      mockRpc.mockResolvedValue({
        data: [
          {
            conversation_id: 'c1',
            other_user_id: 'u2',
            other_username: 'bob',
            other_display_name: 'Bob',
            other_avatar_url: null,
            other_avatar_preset: 'wolf_alpha',
          },
        ],
        error: null,
      });

      const result = await getConversationForNotification('c1');

      expect(Object.keys(result ?? {}).sort()).toEqual(
        ['avatarPreset', 'avatarUrl', 'conversationId', 'displayName', 'id', 'username'].sort(),
      );
    },
  );

  it('retombe sur DEFAULT_WOLF_AVATAR_ID si other_avatar_preset est inattendu (défense en profondeur)', async () => {
    mockRpc.mockResolvedValue({
      data: [
        {
          conversation_id: 'c1',
          other_user_id: 'u2',
          other_username: 'bob',
          other_display_name: 'Bob',
          other_avatar_url: null,
          other_avatar_preset: 'valeur_inconnue',
        },
      ],
      error: null,
    });

    const result = await getConversationForNotification('c1');

    expect(result?.avatarPreset).toBe('wolf_white_calm');
  });

  it("retourne null quand l'appelant n'est plus participant (aucune ligne renvoyée), jamais une erreur distinctive", async () => {
    mockRpc.mockResolvedValue({ data: [], error: null });

    const result = await getConversationForNotification('c1');

    expect(result).toBeNull();
  });

  it('retourne null en cas d\'erreur RPC (ex. session expirée), sans jamais lever une exception vers l\'appelant', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'JWT expired' } });

    const result = await getConversationForNotification('c1');

    expect(result).toBeNull();
  });
});

// Effacement complet d'une conversation (icône pinceau) : passe par l'Edge
// Function clear-conversation, jamais par une RPC/DELETE direct côté client
// (voir supabase/functions/clear-conversation, service_role nécessaire pour
// nettoyer aussi les fichiers Storage de l'AUTRE participant).
describe('clearConversation', () => {
  beforeEach(() => {
    mockFunctionsInvoke.mockReset();
  });

  it("appelle l'Edge Function clear-conversation avec le bon conversation_id et retourne le nombre de messages effacés", async () => {
    mockFunctionsInvoke.mockResolvedValue({ data: { cleared: true, messageCount: 12 }, error: null });

    const count = await clearConversation('conv-1');

    expect(mockFunctionsInvoke).toHaveBeenCalledWith('clear-conversation', {
      body: { conversation_id: 'conv-1' },
    });
    expect(count).toBe(12);
  });

  it('renvoie 0 pour une conversation déjà vide (idempotent), sans erreur', async () => {
    mockFunctionsInvoke.mockResolvedValue({ data: { cleared: true, messageCount: 0 }, error: null });

    const count = await clearConversation('conv-empty');

    expect(count).toBe(0);
  });

  it("lève une erreur générique en français quand l'Edge Function échoue (ex. réseau, 403), sans exposer le détail technique", async () => {
    mockFunctionsInvoke.mockResolvedValue({ data: null, error: { message: 'Edge Function returned a non-2xx status code' } });

    await expect(clearConversation('conv-1')).rejects.toThrow('Impossible d’effacer la conversation pour le moment.');
  });

  it('lève une erreur générique quand cleared=false est renvoyé sans error explicite', async () => {
    mockFunctionsInvoke.mockResolvedValue({ data: { cleared: false, messageCount: 0 }, error: null });

    await expect(clearConversation('conv-1')).rejects.toThrow('Impossible d’effacer la conversation pour le moment.');
  });
});

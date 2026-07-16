import { classifyError, describeError, friendlyRpcError, rpcErrorMessage } from '@/utils/errors';

describe('rpcErrorMessage', () => {
  it('fait confiance au message pour une exception volontaire (SQLSTATE P0001)', () => {
    expect(rpcErrorMessage({ code: 'P0001', message: 'Tu ne peux pas faire ça.' }, 'fallback')).toBe(
      'Tu ne peux pas faire ça.',
    );
  });

  it('ignore tout message sans SQLSTATE P0001 et utilise le fallback', () => {
    expect(rpcErrorMessage({ message: 'relation "x" does not exist' }, 'fallback')).toBe('fallback');
    expect(rpcErrorMessage({ code: '42501', message: 'permission denied' }, 'fallback')).toBe('fallback');
    expect(rpcErrorMessage(null, 'fallback')).toBe('fallback');
  });
});

describe('classifyError', () => {
  it('détecte une panne réseau (React Native)', () => {
    expect(classifyError(new Error('Network request failed'))).toBe('network');
  });

  it('détecte une panne réseau (web)', () => {
    expect(classifyError(new TypeError('Failed to fetch'))).toBe('network');
  });

  it('détecte un délai dépassé', () => {
    expect(classifyError(new Error('The operation timed out'))).toBe('timeout');
    expect(classifyError({ code: '57014', message: 'query canceled' })).toBe('timeout');
  });

  it('détecte une session expirée', () => {
    expect(classifyError(new Error('JWT expired'))).toBe('session_expired');
    expect(classifyError({ code: 'PGRST301', message: 'JWT expired' })).toBe('session_expired');
  });

  it('détecte un accès refusé', () => {
    expect(classifyError({ code: '42501', message: 'permission denied for table messages' })).toBe('access_denied');
    expect(classifyError({ status: 401, message: 'unauthorized' })).toBe('access_denied');
    expect(classifyError({ status: 403, message: 'forbidden' })).toBe('access_denied');
  });

  it('détecte un serveur indisponible', () => {
    expect(classifyError({ status: 503, message: 'Service Unavailable' })).toBe('server_unavailable');
    expect(classifyError({ status: 500, message: 'Internal Server Error' })).toBe('server_unavailable');
  });

  it('retombe sur "unknown" pour une erreur non reconnue', () => {
    expect(classifyError(new Error('relation "x" does not exist'))).toBe('unknown');
    expect(classifyError('une chaîne quelconque')).toBe('unknown');
    expect(classifyError(undefined)).toBe('unknown');
  });
});

describe('describeError', () => {
  it('retourne un message français par catégorie, jamais le message brut', () => {
    expect(describeError(new Error('Network request failed'))).toMatch(/connexion/i);
    expect(describeError(new Error('JWT expired'))).toMatch(/session/i);
    expect(describeError({ code: '42501', message: 'permission denied' })).toMatch(/refusé/i);
    expect(describeError({ status: 503, message: 'Service Unavailable' })).toMatch(/indisponible/i);
    expect(describeError(new Error('timed out'))).toMatch(/délai/i);
  });

  it("n'affiche jamais un détail technique brut (code SQL, stack, token) pour une erreur inconnue : utilise le fallback fourni", () => {
    const technicalError = new Error(
      'insert or update on table "messages" violates foreign key constraint "messages_sender_id_fkey" DETAIL: token=abc123',
    );
    const result = describeError(technicalError, 'Impossible de charger les messages pour le moment.');

    expect(result).toBe('Impossible de charger les messages pour le moment.');
    expect(result).not.toContain('constraint');
    expect(result).not.toContain('token=abc123');
  });

  it('utilise un message générique par défaut si aucun fallback fourni', () => {
    expect(describeError(new Error('relation "x" does not exist'))).toBe('Une erreur est survenue. Réessaie.');
  });
});

describe('friendlyRpcError', () => {
  it('priorise le message volontaire P0001 sur toute classification', () => {
    expect(friendlyRpcError({ code: 'P0001', message: 'Conversation introuvable.' }, 'fallback')).toBe(
      'Conversation introuvable.',
    );
  });

  it('classe une erreur réseau même sans code P0001', () => {
    expect(friendlyRpcError({ message: 'Network request failed' }, 'fallback')).toMatch(/connexion/i);
  });

  it('utilise le fallback fourni pour une erreur non classifiable', () => {
    expect(friendlyRpcError({ message: 'relation "x" does not exist' }, 'Impossible de charger la liste.')).toBe(
      'Impossible de charger la liste.',
    );
  });
});

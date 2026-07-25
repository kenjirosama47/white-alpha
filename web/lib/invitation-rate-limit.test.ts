import { headers } from 'next/headers';

import { hashInvitationCode, hashRequestIp, invitationCodeHashPrefix } from './invitation-rate-limit';

jest.mock('next/headers', () => ({
  headers: jest.fn(),
}));

const mockHeaders = headers as jest.Mock;

function mockHeaderValues(values: Record<string, string>) {
  mockHeaders.mockResolvedValue({
    get: (key: string) => values[key] ?? null,
  });
}

const ORIGINAL_ENV = process.env;

beforeEach(() => {
  jest.resetModules();
  process.env = { ...ORIGINAL_ENV, INVITATION_IP_HASH_SECRET: 'test-secret-value' };
});

afterAll(() => {
  process.env = ORIGINAL_ENV;
});

describe('hashRequestIp', () => {
  it('hache la première IP de x-forwarded-for (jamais l’IP en clair dans le résultat)', async () => {
    mockHeaderValues({ 'x-forwarded-for': '203.0.113.5, 70.41.3.18' });

    const hash = await hashRequestIp();

    expect(hash).not.toContain('203.0.113.5');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('retombe sur x-real-ip si x-forwarded-for est absent', async () => {
    mockHeaderValues({ 'x-real-ip': '198.51.100.7' });

    const hash = await hashRequestIp();

    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('des IP différentes produisent des hachages différents', async () => {
    mockHeaderValues({ 'x-forwarded-for': '203.0.113.5' });
    const hash1 = await hashRequestIp();

    mockHeaderValues({ 'x-forwarded-for': '203.0.113.6' });
    const hash2 = await hashRequestIp();

    expect(hash1).not.toBe(hash2);
  });

  it('lève une erreur si INVITATION_IP_HASH_SECRET n’est pas configuré (échec fermé)', async () => {
    delete process.env.INVITATION_IP_HASH_SECRET;
    mockHeaderValues({ 'x-forwarded-for': '203.0.113.5' });

    await expect(hashRequestIp()).rejects.toThrow('INVITATION_IP_HASH_SECRET manquant.');
  });
});

describe('hashInvitationCode / invitationCodeHashPrefix', () => {
  it('normalise la casse et les espaces avant de hacher (même résultat)', () => {
    expect(hashInvitationCode(' wa-abcd-1234 ')).toBe(hashInvitationCode('WA-ABCD-1234'));
  });

  it('produit un sha256 hexadécimal, jamais le code en clair', () => {
    const hash = hashInvitationCode('WA-ABCD-1234-EFGH-5678');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain('ABCD');
  });

  it('le préfixe est un extrait tronqué du hash complet (16 caractères)', () => {
    const fullHash = hashInvitationCode('WA-ABCD-1234-EFGH-5678');
    const prefix = invitationCodeHashPrefix('WA-ABCD-1234-EFGH-5678');
    expect(prefix).toBe(fullHash.slice(0, 16));
    expect(prefix.length).toBe(16);
  });
});

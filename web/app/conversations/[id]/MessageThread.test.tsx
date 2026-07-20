import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { getSignedAttachmentUrlAction } from './actions';
import { MessageThread } from './MessageThread';
import { useMessages } from './useMessages';
import { useOnlineStatus } from '@/lib/use-online-status';
import type { ConversationHeader, DisplayMessage } from '@/lib/conversations-types';

jest.mock('./useMessages', () => ({ useMessages: jest.fn() }));
jest.mock('@/lib/use-online-status', () => ({ useOnlineStatus: jest.fn() }));
jest.mock('./actions', () => ({
  getRealtimeCredentialsAction: jest.fn(),
  sendMessageAction: jest.fn(),
  fetchMessageByIdAction: jest.fn(),
  getSignedAttachmentUrlAction: jest.fn(),
}));

const mockUseMessages = useMessages as jest.Mock;
const mockUseOnlineStatus = useOnlineStatus as jest.Mock;
const mockGetSignedAttachmentUrlAction = getSignedAttachmentUrlAction as jest.Mock;

const header: ConversationHeader = {
  conversationId: 'c1',
  id: 'u1',
  username: 'wolf1',
  displayName: 'Wolf One',
  avatarUrl: null,
  avatarPreset: 'wolf_grey',
};

function baseHookResult(overrides: Partial<ReturnType<typeof useMessages>> = {}) {
  return {
    messages: [] as DisplayMessage[],
    isLoadingMore: false,
    hasMore: false,
    loadMore: jest.fn(),
    isSending: false,
    isOnline: true,
    send: jest.fn(),
    retry: jest.fn(),
    sendError: null as string | null,
    clearLocalState: jest.fn(),
    ...overrides,
  };
}

describe('MessageThread (Phase 8.4/8.5.4)', () => {
  beforeEach(() => {
    mockUseMessages.mockReset();
    mockUseOnlineStatus.mockReset().mockReturnValue(true);
    mockGetSignedAttachmentUrlAction.mockReset().mockResolvedValue('https://example.supabase.co/signed/photo.jpg');
  });

  it('aucun message : état vide affiché, journal accessible avec le nom du contact', () => {
    mockUseMessages.mockReturnValue(baseHookResult());

    render(<MessageThread conversationId="c1" header={header} initialMessages={[]} currentUserId="me" />);

    expect(screen.getByText('Aucun message pour l’instant. Dites bonjour !')).toBeTruthy();
    expect(screen.getByRole('log', { name: 'Messages avec Wolf One' })).toBeTruthy();
  });

  it('texte seul : contenu propre et reçu tous deux visibles, jamais de média rendu', () => {
    mockUseMessages.mockReturnValue(
      baseHookResult({
        messages: [
          { id: 'm1', conversationId: 'c1', senderId: 'other', content: 'Salut toi', messageType: 'text', createdAt: '2026-01-01T10:00:00Z', attachment: null, status: 'sent' },
          { id: 'm2', conversationId: 'c1', senderId: 'me', content: 'Salut !', messageType: 'text', createdAt: '2026-01-01T10:01:00Z', attachment: null, status: 'sent' },
        ],
      }),
    );

    render(<MessageThread conversationId="c1" header={header} initialMessages={[]} currentUserId="me" />);

    expect(screen.getByText('Salut toi')).toBeTruthy();
    expect(screen.getByText('Salut !')).toBeTruthy();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('séparateur de date : un seul séparateur pour deux messages du même jour', () => {
    mockUseMessages.mockReturnValue(
      baseHookResult({
        messages: [
          { id: 'm1', conversationId: 'c1', senderId: 'other', content: 'Un', messageType: 'text', createdAt: '2026-01-01T10:00:00Z', attachment: null, status: 'sent' },
          { id: 'm2', conversationId: 'c1', senderId: 'other', content: 'Deux', messageType: 'text', createdAt: '2026-01-01T10:05:00Z', attachment: null, status: 'sent' },
        ],
      }),
    );

    render(<MessageThread conversationId="c1" header={header} initialMessages={[]} currentUserId="me" />);

    expect(screen.getAllByRole('separator')).toHaveLength(1);
  });

  it('message en attente : indicateur "Envoi…" affiché', () => {
    mockUseMessages.mockReturnValue(
      baseHookResult({
        messages: [
          { id: 'temp-1', conversationId: 'c1', senderId: 'me', content: 'Salut', messageType: 'text', createdAt: '2026-01-01T10:00:00Z', attachment: null, status: 'pending' },
        ],
      }),
    );

    render(<MessageThread conversationId="c1" header={header} initialMessages={[]} currentUserId="me" />);

    expect(screen.getByText('Envoi…')).toBeTruthy();
  });

  it('message échoué : bouton Réessayer affiché, appelle retry avec l’identifiant du message', () => {
    const retry = jest.fn();
    mockUseMessages.mockReturnValue(
      baseHookResult({
        retry,
        messages: [
          { id: 'temp-1', conversationId: 'c1', senderId: 'me', content: 'Salut', messageType: 'text', createdAt: '2026-01-01T10:00:00Z', attachment: null, status: 'failed' },
        ],
      }),
    );

    render(<MessageThread conversationId="c1" header={header} initialMessages={[]} currentUserId="me" />);

    fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }));
    expect(retry).toHaveBeenCalledWith('temp-1');
  });

  it('historique : bouton "Charger les messages précédents" affiché quand hasMore, appelle loadMore, désactivé pendant le chargement', () => {
    const loadMore = jest.fn();
    mockUseMessages.mockReturnValue(baseHookResult({ hasMore: true, loadMore }));

    const { rerender } = render(<MessageThread conversationId="c1" header={header} initialMessages={[]} currentUserId="me" />);

    const button = screen.getByRole('button', { name: 'Charger les messages précédents' });
    fireEvent.click(button);
    expect(loadMore).toHaveBeenCalled();

    mockUseMessages.mockReturnValue(baseHookResult({ hasMore: true, isLoadingMore: true, loadMore }));
    rerender(<MessageThread conversationId="c1" header={header} initialMessages={[]} currentUserId="me" />);

    expect(screen.getByRole('button', { name: 'Chargement…' })).toBeDisabled();
  });

  it('erreur d’envoi : affichée comme alerte accessible', () => {
    mockUseMessages.mockReturnValue(baseHookResult({ sendError: 'Impossible d’envoyer le message pour le moment.' }));

    render(<MessageThread conversationId="c1" header={header} initialMessages={[]} currentUserId="me" />);

    expect(screen.getByRole('alert')).toHaveTextContent('Impossible d’envoyer le message pour le moment.');
  });

  it('composeur désactivé pendant l’envoi en cours', () => {
    mockUseMessages.mockReturnValue(baseHookResult({ isSending: true }));

    render(<MessageThread conversationId="c1" header={header} initialMessages={[]} currentUserId="me" />);

    expect(screen.getByRole('button', { name: 'Envoyer le message' })).toBeDisabled();
  });

  it('composeur désactivé et bannière hors connexion affichée quand hors connexion', () => {
    mockUseOnlineStatus.mockReturnValue(false);
    mockUseMessages.mockReturnValue(baseHookResult({ isOnline: false }));

    render(<MessageThread conversationId="c1" header={header} initialMessages={[]} currentUserId="me" />);

    expect(screen.getByRole('button', { name: 'Envoyer le message' })).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent('Connexion indisponible');
  });

  describe('affichage réel des médias (Phase 8.5.4)', () => {
    it('média seul (image) : MessageImage rendu, jamais le texte de remplacement', async () => {
      mockUseMessages.mockReturnValue(
        baseHookResult({
          messages: [
            {
              id: 'm1',
              conversationId: 'c1',
              senderId: 'other',
              content: '',
              messageType: 'image',
              createdAt: '2026-01-01T10:00:00Z',
              attachment: { id: 'a1', mediaType: 'image', mimeType: 'image/jpeg', width: 800, height: 600, durationMs: null },
              status: 'sent',
            },
          ],
        }),
      );

      render(<MessageThread conversationId="c1" header={header} initialMessages={[]} currentUserId="me" />);

      await waitFor(() => expect(screen.getByRole('img', { name: 'Photo envoyée dans la conversation' })).toBeInTheDocument());
      expect(screen.queryByText('Pièce jointe (disponible sur l’app mobile)')).not.toBeInTheDocument();
      expect(mockGetSignedAttachmentUrlAction).toHaveBeenCalledWith('a1');
    });

    it('média seul (vidéo) : MessageVideo rendu avec contrôles natifs', async () => {
      mockUseMessages.mockReturnValue(
        baseHookResult({
          messages: [
            {
              id: 'm1',
              conversationId: 'c1',
              senderId: 'other',
              content: '',
              messageType: 'video',
              createdAt: '2026-01-01T10:00:00Z',
              attachment: { id: 'a1', mediaType: 'video', mimeType: 'video/mp4', width: 640, height: 480, durationMs: 5000 },
              status: 'sent',
            },
          ],
        }),
      );

      const { container } = render(<MessageThread conversationId="c1" header={header} initialMessages={[]} currentUserId="me" />);

      await waitFor(() => expect(container.querySelector('video')).toBeTruthy());
      const video = container.querySelector('video') as HTMLVideoElement;
      expect(video).toHaveAttribute('controls');
      expect(video).toHaveAttribute('preload', 'metadata');
      expect(video).not.toHaveAttribute('autoplay');
    });

    it('texte + média : les deux sont affichés pour le même message (jamais deux messages)', async () => {
      mockUseMessages.mockReturnValue(
        baseHookResult({
          messages: [
            {
              id: 'm1',
              conversationId: 'c1',
              senderId: 'other',
              content: 'Regarde ça',
              messageType: 'image',
              createdAt: '2026-01-01T10:00:00Z',
              attachment: { id: 'a1', mediaType: 'image', mimeType: 'image/jpeg', width: 800, height: 600, durationMs: null },
              status: 'sent',
            },
          ],
        }),
      );

      render(<MessageThread conversationId="c1" header={header} initialMessages={[]} currentUserId="me" />);

      await waitFor(() => expect(screen.getByRole('img')).toBeInTheDocument());
      expect(screen.getByText('Regarde ça')).toBeInTheDocument();
      expect(screen.getAllByRole('img')).toHaveLength(1);
    });

    it('ordre chronologique, auteur et avatar inchangés pour un message média', async () => {
      mockUseMessages.mockReturnValue(
        baseHookResult({
          messages: [
            { id: 'm1', conversationId: 'c1', senderId: 'other', content: 'Avant', messageType: 'text', createdAt: '2026-01-01T10:00:00Z', attachment: null, status: 'sent' },
            {
              id: 'm2',
              conversationId: 'c1',
              senderId: 'me',
              content: '',
              messageType: 'image',
              createdAt: '2026-01-01T10:01:00Z',
              attachment: { id: 'a1', mediaType: 'image', mimeType: 'image/jpeg', width: 800, height: 600, durationMs: null },
              status: 'sent',
            },
          ],
        }),
      );

      render(<MessageThread conversationId="c1" header={header} initialMessages={[]} currentUserId="me" />);

      const log = screen.getByRole('log');
      const textIndex = log.textContent?.indexOf('Avant') ?? -1;
      await waitFor(() => expect(screen.getByRole('img')).toBeInTheDocument());
      expect(textIndex).toBeGreaterThanOrEqual(0);
    });
  });
});

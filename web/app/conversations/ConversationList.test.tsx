import { act, render, screen, waitFor } from '@testing-library/react';

import { ConversationList } from './ConversationList';
import { listConversationsAction } from './actions';

jest.mock('./actions', () => ({
  listConversationsAction: jest.fn(),
}));

const mockListConversationsAction = listConversationsAction as jest.Mock;

describe('ConversationList (Phase 8.4)', () => {
  beforeEach(() => {
    mockListConversationsAction.mockReset();
  });

  it('affiche un état de chargement puis la liste', async () => {
    mockListConversationsAction.mockResolvedValue({
      conversations: [
        {
          conversationId: 'c1',
          otherParticipant: { id: 'u1', username: 'wolf1', displayName: 'Wolf One', avatarUrl: null, avatarPreset: 'wolf_grey' },
          lastMessageContent: 'Salut',
          lastMessageCreatedAt: '2026-01-01T00:00:00Z',
        },
      ],
    });

    await act(async () => {
      render(<ConversationList />);
    });

    expect(await screen.findByText('Wolf One')).toBeTruthy();
    expect(screen.getByText('Salut')).toBeTruthy();
  });

  it('liste vide : affiche l’état vide avec le bouton nouvelle conversation', async () => {
    mockListConversationsAction.mockResolvedValue({ conversations: [] });

    await act(async () => {
      render(<ConversationList />);
    });

    expect(await screen.findByText('La meute est encore silencieuse')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Nouvelle conversation' })).toBeTruthy();
  });

  it('erreur réseau : affiche un message et un bouton Réessayer fonctionnel', async () => {
    mockListConversationsAction.mockResolvedValueOnce({ error: 'Impossible de charger les conversations pour le moment.' });

    await act(async () => {
      render(<ConversationList />);
    });

    expect(await screen.findByRole('alert')).toHaveTextContent('Impossible de charger');

    mockListConversationsAction.mockResolvedValueOnce({ conversations: [] });
    const retryButton = screen.getByRole('button', { name: 'Réessayer' });
    await act(async () => {
      retryButton.click();
    });

    await waitFor(() => expect(mockListConversationsAction).toHaveBeenCalledTimes(2));
  });
});

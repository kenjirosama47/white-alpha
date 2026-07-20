import { act, fireEvent, render, screen } from '@testing-library/react';

import { SearchForm } from './SearchForm';
import { searchMembersAction, startConversationAction } from '../actions';

const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock('../actions', () => ({
  searchMembersAction: jest.fn(),
  startConversationAction: jest.fn(),
}));

const mockSearchMembersAction = searchMembersAction as jest.Mock;
const mockStartConversationAction = startConversationAction as jest.Mock;

describe('SearchForm (Phase 8.4)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockSearchMembersAction.mockReset();
    mockStartConversationAction.mockReset();
    mockPush.mockReset();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('sous le minimum de caractères : aucun appel réseau', async () => {
    render(<SearchForm />);

    fireEvent.change(screen.getByLabelText("Nom d'utilisateur"), { target: { value: 'a' } });

    await act(async () => {
      jest.advanceTimersByTime(1000);
    });

    expect(mockSearchMembersAction).not.toHaveBeenCalled();
  });

  it('recherche valide : attend le délai anti-spam avant d’appeler la RPC, affiche les résultats (avatar + nom uniquement, jamais un email)', async () => {
    mockSearchMembersAction.mockResolvedValue({
      results: [{ id: 'u1', username: 'wolf1', displayName: 'Wolf One', avatarUrl: null, avatarPreset: 'wolf_grey' }],
      error: null,
    });

    render(<SearchForm />);
    fireEvent.change(screen.getByLabelText("Nom d'utilisateur"), { target: { value: 'wolf' } });

    // Pas encore appelé avant la fin du délai anti-spam.
    expect(mockSearchMembersAction).not.toHaveBeenCalled();

    await act(async () => {
      jest.advanceTimersByTime(500);
    });

    expect(mockSearchMembersAction).toHaveBeenCalledWith('wolf');
    expect(await screen.findByText('Wolf One')).toBeTruthy();
    expect(document.body.textContent).not.toContain('@');
  });

  it('aucun résultat : affiche le message officiel', async () => {
    mockSearchMembersAction.mockResolvedValue({ results: [], error: null });

    render(<SearchForm />);
    fireEvent.change(screen.getByLabelText("Nom d'utilisateur"), { target: { value: 'wolf' } });

    await act(async () => {
      jest.advanceTimersByTime(500);
    });

    expect(await screen.findByText('Aucun membre trouvé')).toBeTruthy();
  });

  it('sélection d’un membre : crée/ouvre la conversation puis navigue', async () => {
    mockSearchMembersAction.mockResolvedValue({
      results: [{ id: 'u1', username: 'wolf1', displayName: 'Wolf One', avatarUrl: null, avatarPreset: 'wolf_grey' }],
      error: null,
    });
    mockStartConversationAction.mockResolvedValue({ conversationId: 'conv-1' });

    render(<SearchForm />);
    fireEvent.change(screen.getByLabelText("Nom d'utilisateur"), { target: { value: 'wolf' } });
    await act(async () => {
      jest.advanceTimersByTime(500);
    });

    const resultButton = await screen.findByRole('button', { name: /Wolf One/ });
    await act(async () => {
      fireEvent.click(resultButton);
    });

    expect(mockStartConversationAction).toHaveBeenCalledWith('u1');
    expect(mockPush).toHaveBeenCalledWith('/conversations/conv-1');
  });
});

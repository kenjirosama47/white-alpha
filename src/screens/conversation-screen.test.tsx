import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import ConversationScreen from '@/app/(app)/conversation/[id]';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
  useLocalSearchParams: () => ({ id: 'conv-1', otherDisplayName: 'Bob' }),
}));

jest.mock('react-native-safe-area-context', () => {
  const actual = jest.requireActual('react-native-safe-area-context');
  return {
    ...actual,
    useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
  };
});

jest.mock('@/contexts/auth-context', () => ({
  useAuth: () => ({ session: { user: { id: 'user-1' } } }),
}));

const mockSend = jest.fn();
jest.mock('@/hooks/use-messages', () => ({
  useMessages: () => ({
    messages: [],
    isLoading: false,
    isLoadingMore: false,
    hasMore: false,
    error: null,
    sendError: null,
    isSending: false,
    loadMore: jest.fn(),
    send: mockSend,
  }),
}));

describe('ConversationScreen — composer', () => {
  beforeEach(() => {
    mockSend.mockReset();
  });

  it("le bouton Envoyer reste désactivé et n'appelle pas send tant que le champ est vide", async () => {
    await render(<ConversationScreen />);

    fireEvent.press(screen.getByText('Envoyer'));

    expect(mockSend).not.toHaveBeenCalled();
  });

  it('saisie un texte, active le bouton, envoie une seule fois puis vide le champ après succès', async () => {
    mockSend.mockResolvedValue(true);
    await render(<ConversationScreen />);

    const input = screen.getByPlaceholderText('Écrire un message...');
    fireEvent.changeText(input, 'Salut Bob !');
    await waitFor(() => expect(input.props.value).toBe('Salut Bob !'));

    fireEvent.press(screen.getByText('Envoyer'));

    await waitFor(() => expect(mockSend).toHaveBeenCalledTimes(1));
    expect(mockSend).toHaveBeenCalledWith('Salut Bob !');

    await waitFor(() => expect(input.props.value).toBe(''));
  });

  it("conserve le contenu du champ si l'envoi échoue", async () => {
    mockSend.mockResolvedValue(false);
    await render(<ConversationScreen />);

    const input = screen.getByPlaceholderText('Écrire un message...');
    fireEvent.changeText(input, 'Message qui va échouer');
    await waitFor(() => expect(input.props.value).toBe('Message qui va échouer'));

    fireEvent.press(screen.getByText('Envoyer'));

    await waitFor(() => expect(mockSend).toHaveBeenCalledTimes(1));
    expect(input.props.value).toBe('Message qui va échouer');
  });

  it('peut aussi envoyer via la touche de validation du clavier (onSubmitEditing)', async () => {
    mockSend.mockResolvedValue(true);
    await render(<ConversationScreen />);

    const input = screen.getByPlaceholderText('Écrire un message...');
    fireEvent.changeText(input, 'Envoyé au clavier');
    await waitFor(() => expect(input.props.value).toBe('Envoyé au clavier'));
    fireEvent(input, 'submitEditing');

    await waitFor(() => expect(mockSend).toHaveBeenCalledTimes(1));
    expect(mockSend).toHaveBeenCalledWith('Envoyé au clavier');
  });
});

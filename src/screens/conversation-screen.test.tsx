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

// Coupe la chaîne d'import réelle vers @supabase/supabase-js / AsyncStorage :
// message-bubble -> message-image -> use-signed-attachment-url -> services/media
// importent tous @/lib/supabase, absent de l'environnement Jest sinon.
jest.mock('@/lib/supabase', () => ({
  supabase: { storage: { from: jest.fn() } },
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

const mockPick = jest.fn();
const mockCancelImage = jest.fn();
const mockSendImage = jest.fn();
let mockPickedImage: { uri: string; mimeType: string; sizeBytes: number | null; width: number | null; height: number | null } | null =
  null;
let mockImageError: string | null = null;

jest.mock('@/hooks/use-media-upload', () => ({
  useMediaUpload: () => ({
    pickedImage: mockPickedImage,
    isUploading: false,
    error: mockImageError,
    pick: mockPick,
    cancel: mockCancelImage,
    send: mockSendImage,
  }),
}));

describe('ConversationScreen — composer', () => {
  beforeEach(() => {
    mockSend.mockReset();
    mockPick.mockReset();
    mockCancelImage.mockReset();
    mockSendImage.mockReset();
    mockPickedImage = null;
    mockImageError = null;
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

describe('ConversationScreen — photo', () => {
  beforeEach(() => {
    mockSend.mockReset();
    mockPick.mockReset();
    mockCancelImage.mockReset();
    mockSendImage.mockReset();
    mockPickedImage = null;
    mockImageError = null;
  });

  it('le bouton Photo déclenche la sélection depuis la bibliothèque', async () => {
    await render(<ConversationScreen />);

    fireEvent.press(screen.getByText('Photo'));

    expect(mockPick).toHaveBeenCalledTimes(1);
  });

  it("affiche un aperçu avec Annuler/Envoyer une fois une photo sélectionnée, et conserve le texte déjà saisi", async () => {
    mockPickedImage = { uri: 'file:///photo.jpg', mimeType: 'image/jpeg', sizeBytes: 1000, width: 100, height: 100 };
    await render(<ConversationScreen />);

    const input = screen.getByPlaceholderText('Écrire un message...');
    fireEvent.changeText(input, 'Texte en cours de rédaction');
    await waitFor(() => expect(input.props.value).toBe('Texte en cours de rédaction'));

    expect(screen.getByText('Annuler')).toBeTruthy();
    expect(screen.getAllByText('Envoyer').length).toBeGreaterThanOrEqual(1);

    fireEvent.press(screen.getByText('Annuler'));
    expect(mockCancelImage).toHaveBeenCalledTimes(1);
    // Annuler la photo ne doit jamais vider le texte déjà saisi.
    expect(input.props.value).toBe('Texte en cours de rédaction');
  });

  it("le bouton Envoyer de l'aperçu déclenche l'envoi de l'image", async () => {
    mockPickedImage = { uri: 'file:///photo.jpg', mimeType: 'image/jpeg', sizeBytes: 1000, width: 100, height: 100 };
    await render(<ConversationScreen />);

    // Deux boutons "Envoyer" existent (texte + photo) : l'aperçu photo est
    // rendu avant la barre de composition dans l'arbre, donc en premier.
    const sendButtons = screen.getAllByText('Envoyer');
    fireEvent.press(sendButtons[0]);

    await waitFor(() => expect(mockSendImage).toHaveBeenCalledTimes(1));
  });

  it("affiche l'erreur de sélection/envoi de la photo en français", async () => {
    mockImageError = 'Accès à tes photos refusé. Autorise l’accès dans les réglages pour envoyer une image.';
    await render(<ConversationScreen />);

    expect(screen.getByText(mockImageError)).toBeTruthy();
  });
});

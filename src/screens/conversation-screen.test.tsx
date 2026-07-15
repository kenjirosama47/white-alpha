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

// message-video importe expo-video, dont le binding natif ne peut pas être
// chargé dans l'environnement Jest (hors runtime natif) : ce test d'écran ne
// porte pas sur la lecture vidéo elle-même (voir message-video.test.tsx).
jest.mock('@/components/message-video', () => ({
  MessageVideo: () => null,
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

const mockPickImage = jest.fn();
const mockPickVideo = jest.fn();
const mockCancelMedia = jest.fn();
const mockCancelUpload = jest.fn();
const mockSendMedia = jest.fn();
type MockPickedMedia =
  | { kind: 'image'; data: { uri: string; mimeType: string; sizeBytes: number | null; width: number | null; height: number | null } }
  | {
      kind: 'video';
      data: {
        uri: string;
        mimeType: string;
        sizeBytes: number | null;
        durationMs: number | null;
        width: number | null;
        height: number | null;
      };
    };
let mockPickedMedia: MockPickedMedia | null = null;
let mockMediaError: string | null = null;
let mockUploadProgress: number | null = null;
let mockIsUploadingMedia = false;

jest.mock('@/hooks/use-media-upload', () => ({
  useMediaUpload: () => ({
    pickedMedia: mockPickedMedia,
    isUploading: mockIsUploadingMedia,
    uploadProgress: mockUploadProgress,
    error: mockMediaError,
    pickImage: mockPickImage,
    pickVideo: mockPickVideo,
    cancel: mockCancelMedia,
    cancelUpload: mockCancelUpload,
    send: mockSendMedia,
  }),
}));

describe('ConversationScreen — composer', () => {
  beforeEach(() => {
    mockSend.mockReset();
    mockPickImage.mockReset();
    mockPickVideo.mockReset();
    mockCancelMedia.mockReset();
    mockCancelUpload.mockReset();
    mockSendMedia.mockReset();
    mockPickedMedia = null;
    mockMediaError = null;
    mockUploadProgress = null;
    mockIsUploadingMedia = false;
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

describe('ConversationScreen — photo et vidéo', () => {
  beforeEach(() => {
    mockSend.mockReset();
    mockPickImage.mockReset();
    mockPickVideo.mockReset();
    mockCancelMedia.mockReset();
    mockCancelUpload.mockReset();
    mockSendMedia.mockReset();
    mockPickedMedia = null;
    mockMediaError = null;
    mockUploadProgress = null;
    mockIsUploadingMedia = false;
  });

  it('le bouton Photo déclenche la sélection depuis la bibliothèque', async () => {
    await render(<ConversationScreen />);

    fireEvent.press(screen.getByText('Photo'));

    expect(mockPickImage).toHaveBeenCalledTimes(1);
  });

  it('le bouton Vidéo déclenche la sélection depuis la bibliothèque', async () => {
    await render(<ConversationScreen />);

    fireEvent.press(screen.getByText('Vidéo'));

    expect(mockPickVideo).toHaveBeenCalledTimes(1);
  });

  it("affiche un aperçu avec Annuler/Envoyer une fois une photo sélectionnée, et conserve le texte déjà saisi", async () => {
    mockPickedMedia = {
      kind: 'image',
      data: { uri: 'file:///photo.jpg', mimeType: 'image/jpeg', sizeBytes: 1000, width: 100, height: 100 },
    };
    await render(<ConversationScreen />);

    const input = screen.getByPlaceholderText('Écrire un message...');
    fireEvent.changeText(input, 'Texte en cours de rédaction');
    await waitFor(() => expect(input.props.value).toBe('Texte en cours de rédaction'));

    expect(screen.getByText('Annuler')).toBeTruthy();
    expect(screen.getAllByText('Envoyer').length).toBeGreaterThanOrEqual(1);

    fireEvent.press(screen.getByText('Annuler'));
    expect(mockCancelMedia).toHaveBeenCalledTimes(1);
    // Annuler le média ne doit jamais vider le texte déjà saisi.
    expect(input.props.value).toBe('Texte en cours de rédaction');
  });

  it("le bouton Envoyer de l'aperçu déclenche l'envoi du média", async () => {
    mockPickedMedia = {
      kind: 'image',
      data: { uri: 'file:///photo.jpg', mimeType: 'image/jpeg', sizeBytes: 1000, width: 100, height: 100 },
    };
    await render(<ConversationScreen />);

    // Deux boutons "Envoyer" existent (texte + média) : l'aperçu média est
    // rendu avant la barre de composition dans l'arbre, donc en premier.
    const sendButtons = screen.getAllByText('Envoyer');
    fireEvent.press(sendButtons[0]);

    await waitFor(() => expect(mockSendMedia).toHaveBeenCalledTimes(1));
  });

  it("affiche l'erreur de sélection/envoi du média en français", async () => {
    mockMediaError = 'Accès à tes photos refusé. Autorise l’accès dans les réglages pour envoyer une image.';
    await render(<ConversationScreen />);

    expect(screen.getByText(mockMediaError)).toBeTruthy();
  });

  it('affiche la durée et la taille pour un aperçu vidéo, et le bouton Annuler l’envoi pendant l’upload', async () => {
    mockPickedMedia = {
      kind: 'video',
      data: { uri: 'file:///clip.mp4', mimeType: 'video/mp4', sizeBytes: 2_000_000, durationMs: 15_000, width: 1280, height: 720 },
    };
    mockIsUploadingMedia = true;
    mockUploadProgress = 42;
    await render(<ConversationScreen />);

    expect(screen.getByText('0:15 · 1.9 Mo')).toBeTruthy();
    fireEvent.press(screen.getByText('Annuler l’envoi'));
    expect(mockCancelUpload).toHaveBeenCalledTimes(1);
  });

  it('le bouton Photo/Vidéo est désactivé pendant qu’un média est en cours de préparation ou d’upload', async () => {
    mockPickedMedia = {
      kind: 'image',
      data: { uri: 'file:///photo.jpg', mimeType: 'image/jpeg', sizeBytes: 1000, width: 100, height: 100 },
    };
    await render(<ConversationScreen />);

    fireEvent.press(screen.getByText('Vidéo'));
    // Une pièce jointe est déjà sélectionnée : un second média ne doit pas être lancé.
    expect(mockPickVideo).not.toHaveBeenCalled();
  });

  it("n'empêche jamais l'envoi d'un message texte pendant la préparation d'une vidéo", async () => {
    mockPickedMedia = {
      kind: 'video',
      data: { uri: 'file:///clip.mp4', mimeType: 'video/mp4', sizeBytes: 2_000_000, durationMs: 15_000, width: 1280, height: 720 },
    };
    mockIsUploadingMedia = true;
    mockSend.mockResolvedValue(true);
    await render(<ConversationScreen />);

    const input = screen.getByPlaceholderText('Écrire un message...');
    fireEvent.changeText(input, 'Message texte indépendant');
    await waitFor(() => expect(input.props.value).toBe('Message texte indépendant'));

    const sendButtons = screen.getAllByText('Envoyer');
    fireEvent.press(sendButtons[sendButtons.length - 1]);

    await waitFor(() => expect(mockSend).toHaveBeenCalledWith('Message texte indépendant'));
  });
});

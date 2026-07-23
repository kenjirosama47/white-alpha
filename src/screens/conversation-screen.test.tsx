import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import { Alert } from 'react-native';
import { FadeIn } from 'react-native-reanimated';

import ConversationScreen, { getConversationKeyboardAvoidingBehavior } from '@/app/(app)/conversation/[id]';
import { clearConversation } from '@/services/conversations';
import type { Message } from '@/types/chat';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
  useLocalSearchParams: () => ({ id: 'conv-1', otherDisplayName: 'Bob', otherAvatarPreset: 'wolf_grey' }),
}));

jest.mock('@/services/conversations', () => ({
  clearConversation: jest.fn(),
}));

const mockClearConversation = clearConversation as jest.Mock;

/** Simule l'appui utilisateur sur le bouton demandé (par titre exact) de la dernière Alert.alert affichée. */
function pressAlertButton(buttonText: string) {
  const alertSpy = Alert.alert as jest.Mock;
  const lastCall = alertSpy.mock.calls[alertSpy.mock.calls.length - 1];
  const buttons = lastCall?.[2] as { text: string; onPress?: () => void }[];
  const button = buttons?.find((b) => b.text === buttonText);
  button?.onPress?.();
}

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
let mockMessages: unknown[] = [];
jest.mock('@/hooks/use-messages', () => ({
  useMessages: () => ({
    messages: mockMessages,
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

jest.mock('@/hooks/use-signed-attachment-url', () => ({
  useSignedAttachmentUrl: () => ({
    url: 'https://signed.example/photo.jpg',
    isLoading: false,
    error: null,
    refresh: jest.fn(),
  }),
}));

const mockRestoreAccessibilityFocus = jest.fn();
jest.mock('@/utils/accessibility-focus', () => ({
  restoreAccessibilityFocus: (...args: unknown[]) => mockRestoreAccessibilityFocus(...args),
}));

let mockReduceMotion = false;
jest.mock('@/hooks/use-reduced-motion', () => ({
  useReducedMotion: () => mockReduceMotion,
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

    // Le bouton d'envoi du composeur texte est circulaire (glyphe « ➤ »,
    // Anomalie 2, build 16) : ciblé par son accessibilityLabel, jamais par
    // un texte visible désormais réservé au bouton « Envoyer » de l'aperçu
    // média (attachment-composer-preview.tsx, inchangé).
    fireEvent.press(screen.getByLabelText('Envoyer le message'));

    expect(mockSend).not.toHaveBeenCalled();
  });

  it('saisie un texte, active le bouton, envoie une seule fois puis vide le champ après succès', async () => {
    mockSend.mockResolvedValue(true);
    await render(<ConversationScreen />);

    const input = screen.getByPlaceholderText('Écrire un message...');
    fireEvent.changeText(input, 'Salut Bob !');
    await waitFor(() => expect(input.props.value).toBe('Salut Bob !'));

    fireEvent.press(screen.getByLabelText('Envoyer le message'));

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

    fireEvent.press(screen.getByLabelText('Envoyer le message'));

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

  it("l'icône trombone reste visible et cliquable, et ouvre le menu Photo/Vidéo/Annuler", async () => {
    await render(<ConversationScreen />);

    const attachmentButton = screen.getByLabelText('Ajouter une pièce jointe');
    expect(attachmentButton).toBeTruthy();
    expect(screen.queryByText('Photo')).toBeNull();

    fireEvent.press(attachmentButton);

    await waitFor(() => expect(screen.getByText('Photo')).toBeTruthy());
    expect(screen.getByText('Vidéo')).toBeTruthy();
    expect(screen.getByText('Annuler')).toBeTruthy();
  });

  it('le trombone puis Photo déclenche la sélection depuis la bibliothèque', async () => {
    await render(<ConversationScreen />);

    fireEvent.press(screen.getByLabelText('Ajouter une pièce jointe'));
    await waitFor(() => expect(screen.getByText('Photo')).toBeTruthy());
    fireEvent.press(screen.getByText('Photo'));

    expect(mockPickImage).toHaveBeenCalledTimes(1);
  });

  it('le trombone puis Vidéo déclenche la sélection depuis la bibliothèque', async () => {
    await render(<ConversationScreen />);

    fireEvent.press(screen.getByLabelText('Ajouter une pièce jointe'));
    await waitFor(() => expect(screen.getByText('Vidéo')).toBeTruthy());
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
    // Un seul bouton texte « Envoyer » désormais : celui de l'aperçu média
    // (attachment-composer-preview.tsx, inchangé) — le bouton du composeur
    // texte est circulaire (glyphe « ➤ », Anomalie 2, build 16).
    expect(screen.getByText('Envoyer')).toBeTruthy();

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

    fireEvent.press(screen.getByText('Envoyer'));

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

  it('le trombone est désactivé (menu ne s’ouvre pas) pendant qu’un média est en cours de préparation ou d’upload', async () => {
    mockPickedMedia = {
      kind: 'image',
      data: { uri: 'file:///photo.jpg', mimeType: 'image/jpeg', sizeBytes: 1000, width: 100, height: 100 },
    };
    await render(<ConversationScreen />);

    fireEvent.press(screen.getByLabelText('Ajouter une pièce jointe'));
    // Une pièce jointe est déjà sélectionnée : le trombone est désactivé, le
    // menu ne s'ouvre pas, un second média ne doit pas être lancé.
    expect(screen.queryByText('Vidéo')).toBeNull();
    expect(mockPickVideo).not.toHaveBeenCalled();
    expect(mockPickImage).not.toHaveBeenCalled();
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

    fireEvent.press(screen.getByLabelText('Envoyer le message'));

    await waitFor(() => expect(mockSend).toHaveBeenCalledWith('Message texte indépendant'));
  });
});

const imageMessage: Message = {
  id: 'msg-1',
  conversationId: 'conv-1',
  senderId: 'user-2',
  content: '',
  createdAt: '2026-07-18T10:00:00.000Z',
  attachment: {
    id: 'att-1',
    messageId: 'msg-1',
    conversationId: 'conv-1',
    uploaderId: 'user-2',
    storagePath: 'conv-1/user-2/photo.jpg',
    sizeBytes: 1000,
    width: 800,
    height: 600,
    createdAt: '2026-07-18T10:00:00.000Z',
    mediaType: 'image',
    mimeType: 'image/jpeg',
  },
};

describe('ConversationScreen — visionneuse image et restauration du focus (Phase 7.6)', () => {
  beforeEach(() => {
    mockRestoreAccessibilityFocus.mockReset();
    mockMessages = [imageMessage];
  });

  afterEach(() => {
    mockMessages = [];
  });

  it('ouvre la visionneuse au tap sur une image, puis restaure le focus sur cette image à la fermeture', async () => {
    await render(<ConversationScreen />);

    fireEvent.press(screen.getByTestId('message-image-pressable'));

    expect(await screen.findByRole('button', { name: "Fermer l'image" })).toBeTruthy();

    fireEvent.press(screen.getByRole('button', { name: "Fermer l'image" }));

    expect(mockRestoreAccessibilityFocus).toHaveBeenCalledTimes(1);
    expect(mockRestoreAccessibilityFocus.mock.calls[0][0]).not.toBeNull();
  });

  it("ne plante jamais si la référence déclencheur n'existe plus (ex. liste re-rendue avant la fermeture)", async () => {
    await render(<ConversationScreen />);

    fireEvent.press(screen.getByTestId('message-image-pressable'));
    expect(await screen.findByRole('button', { name: "Fermer l'image" })).toBeTruthy();

    // Simule une liste vidée (ex. suppression) pendant que la visionneuse est ouverte.
    mockMessages = [];

    expect(() => fireEvent.press(screen.getByRole('button', { name: "Fermer l'image" }))).not.toThrow();
  });

  it("respecte toujours la réduction des animations sur la liste de messages, même avec la visionneuse disponible", async () => {
    mockReduceMotion = true;
    const durationSpy = jest.spyOn(FadeIn, 'duration');

    await render(<ConversationScreen />);

    expect(durationSpy).not.toHaveBeenCalled();
    mockReduceMotion = false;
    durationSpy.mockRestore();
  });
});

describe("ConversationScreen — en-tête (Anomalie 1/2, build 16)", () => {
  it(
    "affiche l'avatar loup de l'interlocuteur dans l'en-tête, à partir du route param otherAvatarPreset " +
      '(absent avant ce correctif)',
    async () => {
      await render(<ConversationScreen />);

      expect(screen.getByLabelText('Avatar loup de Bob')).toBeTruthy();
    },
  );
});

// Correctif build 20 (A1/A2) : les icônes trombone/pinceau étaient des
// emoji rendus via ThemedText, agrandis jusqu'à ×2 par maxFontSizeMultiplier
// (accessibilité), sans hauteur plafonnée sur les barres qui les contiennent
// — masquant le trombone sous le clavier et gonflant l'en-tête. Ces tests
// verrouillent le remplacement par de vraies icônes vectorielles à taille
// fixe (@expo/vector-icons), insensibles à la taille de police système.
// Placé avant le describe "effacer la conversation" ci-dessous : sa
// dernière suite (double-appel avec promesse différée résolue en fin de
// test) laisse une mise à jour d'état asynchrone traverser dans le test
// suivant si celui-ci est monté juste après, faisant échouer des requêtes
// getByLabelText/getByTestId pourtant correctes (pollution entre tests,
// préexistante à ce correctif, contournée ici par l'ordre plutôt que par
// une modification de la logique d'effacement elle-même).
describe('ConversationScreen — icônes vectorielles à taille fixe (correctif A1/A2, build 20)', () => {
  beforeEach(() => {
    mockPickedMedia = null;
    mockMediaError = null;
    mockUploadProgress = null;
    mockIsUploadingMedia = false;
  });

  it("l'icône trombone est une vraie icône vectorielle (paperclip), pas un emoji texte redimensionnable", async () => {
    await render(<ConversationScreen />);

    // @expo/vector-icons rend en interne un Text hôte : allowFontScaling
    // (défaut false dans la bibliothèque elle-même, explicité ici) et size
    // (-> fontSize) s'y retrouvent directement.
    const icon = screen.getByTestId('attachment-icon');
    expect(icon.props.allowFontScaling).toBe(false);
    const flatStyle = Object.assign({}, ...[icon.props.style].flat());
    expect(flatStyle.fontSize).toBe(24);
  });

  it("l'icône pinceau est une vraie icône vectorielle (brush), pas un emoji texte redimensionnable", async () => {
    await render(<ConversationScreen />);

    const icon = screen.getByTestId('clear-conversation-icon');
    expect(icon.props.allowFontScaling).toBe(false);
    const flatStyle = Object.assign({}, ...[icon.props.style].flat());
    expect(flatStyle.fontSize).toBe(22);
  });

  it('le trombone conserve une zone tactile fixe d’au moins 44×44, indépendante du contenu', async () => {
    await render(<ConversationScreen />);

    const button = screen.getByLabelText('Ajouter une pièce jointe');
    const flatStyle = Object.assign({}, ...[button.props.style].flat());
    expect(flatStyle.width).toBeGreaterThanOrEqual(44);
    expect(flatStyle.minHeight).toBeGreaterThanOrEqual(44);
  });

  it('le pinceau conserve une zone tactile fixe d’au moins 44×44, indépendante du contenu', async () => {
    await render(<ConversationScreen />);

    const button = screen.getByLabelText('Effacer la conversation');
    const flatStyle = Object.assign({}, ...[button.props.style].flat());
    expect(flatStyle.width).toBeGreaterThanOrEqual(44);
    expect(flatStyle.minHeight).toBeGreaterThanOrEqual(44);
  });
});

// Correctif A1 (build 21) : `behavior="height"` sur Android était cumulé à
// `android:windowSoftInputMode="adjustResize"` (déjà correct, non modifié),
// provoquant un double redimensionnement qui masquait le trombone à
// l'ouverture du clavier (test réel, appareil physique, police système
// agrandie). Ces tests verrouillent la logique par plateforme et la
// présence continue du composeur/trombone.
describe('ConversationScreen — KeyboardAvoidingView par plateforme (correctif A1, build 21)', () => {
  it("behavior='padding' sur iOS", () => {
    expect(getConversationKeyboardAvoidingBehavior('ios')).toBe('padding');
  });

  it('behavior absent (undefined) sur Android — seul adjustResize gère le clavier', () => {
    expect(getConversationKeyboardAvoidingBehavior('android')).toBeUndefined();
  });

  it('behavior absent (undefined) sur toute autre plateforme (web, etc.)', () => {
    expect(getConversationKeyboardAvoidingBehavior('web')).toBeUndefined();
  });

  it('le trombone est bien rendu dans le composeur', async () => {
    await render(<ConversationScreen />);

    expect(screen.getByLabelText('Ajouter une pièce jointe')).toBeTruthy();
  });

  it('le composeur (trombone, champ de texte, bouton d’envoi) reste présent après un changement de contenu simulant l’ouverture du clavier', async () => {
    await render(<ConversationScreen />);

    const input = screen.getByPlaceholderText('Écrire un message...');
    fireEvent(input, 'focus');
    await waitFor(() => {
      expect(screen.getByLabelText('Ajouter une pièce jointe')).toBeTruthy();
      expect(screen.getByPlaceholderText('Écrire un message...')).toBeTruthy();
      expect(screen.getByLabelText('Envoyer le message')).toBeTruthy();
    });
  });
});

describe('ConversationScreen — effacer la conversation (icône pinceau)', () => {
  let alertSpy: jest.SpyInstance;

  beforeEach(() => {
    mockClearConversation.mockReset();
    (router.back as jest.Mock).mockReset();
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  });

  afterEach(() => {
    alertSpy.mockRestore();
  });

  it("l'icône pinceau est visible et accessible", async () => {
    await render(<ConversationScreen />);

    expect(screen.getByLabelText('Effacer la conversation')).toBeTruthy();
  });

  it('affiche une confirmation explicite (titre + message + Annuler/Effacer définitivement) au premier appui, sans encore rien effacer', async () => {
    await render(<ConversationScreen />);

    fireEvent.press(screen.getByLabelText('Effacer la conversation'));

    expect(alertSpy).toHaveBeenCalledWith(
      'Effacer toute la conversation ?',
      'Tous les messages et médias de cette conversation seront définitivement supprimés. Cette action est irréversible.',
      expect.arrayContaining([
        expect.objectContaining({ text: 'Annuler' }),
        expect.objectContaining({ text: 'Effacer définitivement', style: 'destructive' }),
      ]),
    );
    expect(mockClearConversation).not.toHaveBeenCalled();
  });

  it("Annuler : rien n'est supprimé", async () => {
    await render(<ConversationScreen />);

    fireEvent.press(screen.getByLabelText('Effacer la conversation'));
    pressAlertButton('Annuler');

    expect(mockClearConversation).not.toHaveBeenCalled();
    expect(router.back).not.toHaveBeenCalled();
  });

  it('Effacer définitivement : appelle clearConversation avec le bon id puis revient à la liste des conversations', async () => {
    mockClearConversation.mockResolvedValue(5);
    await render(<ConversationScreen />);

    fireEvent.press(screen.getByLabelText('Effacer la conversation'));
    pressAlertButton('Effacer définitivement');

    await waitFor(() => expect(mockClearConversation).toHaveBeenCalledWith('conv-1'));
    await waitFor(() => expect(router.back).toHaveBeenCalledTimes(1));
  });

  it('affiche un message clair en cas d’échec, sans revenir à la liste', async () => {
    mockClearConversation.mockRejectedValue(new Error('Impossible d’effacer la conversation pour le moment.'));
    await render(<ConversationScreen />);

    fireEvent.press(screen.getByLabelText('Effacer la conversation'));
    pressAlertButton('Effacer définitivement');

    await waitFor(() => expect(screen.getByText('Impossible d’effacer la conversation pour le moment.')).toBeTruthy());
    expect(router.back).not.toHaveBeenCalled();
  });

  it('empêche le double appel : un second appui pendant la suppression en cours ne déclenche pas un second clearConversation', async () => {
    let resolveClear: (value: number) => void = () => {};
    mockClearConversation.mockReturnValue(
      new Promise<number>((resolve) => {
        resolveClear = resolve;
      }),
    );
    await render(<ConversationScreen />);

    fireEvent.press(screen.getByLabelText('Effacer la conversation'));
    pressAlertButton('Effacer définitivement');
    // Second appui pendant que la suppression est encore en cours (bouton désactivé).
    fireEvent.press(screen.getByLabelText('Effacer la conversation'));

    expect(mockClearConversation).toHaveBeenCalledTimes(1);
    resolveClear(3);
    await waitFor(() => expect(router.back).toHaveBeenCalledTimes(1));
  });
});

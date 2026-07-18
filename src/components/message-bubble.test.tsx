import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { MessageBubble } from '@/components/message-bubble';
import { Colors } from '@/constants/theme';
import type { Message } from '@/types/chat';

function flattenStyle(style: unknown): Record<string, unknown> {
  return ([style] as unknown[])
    .flat(Infinity)
    .filter(Boolean)
    .reduce((acc, s) => ({ ...(acc as object), ...(s as object) }), {}) as Record<string, unknown>;
}

jest.mock('@/components/message-image', () => ({
  MessageImage: () => null,
}));

// Mock volontairement minimal : dans l'app réelle, VideoView (rendu natif
// Android SurfaceView/TextureView) peut visuellement recouvrir des vues
// sœurs — impossible à simuler en JSDOM. Les tests vérifient plutôt que le
// bouton ⋮ et son menu restent bien accessibles dans l'arbre React, quel que
// soit ce que MessageVideo rend à côté.
jest.mock('@/components/message-video', () => ({
  MessageVideo: () => null,
}));

const textMessage: Message = {
  id: 'm-text',
  conversationId: 'conv-1',
  senderId: 'user-1',
  content: 'Salut',
  createdAt: '2026-07-16T10:00:00Z',
  attachment: null,
};

const videoMessage: Message = {
  id: 'm-video',
  conversationId: 'conv-1',
  senderId: 'user-1',
  content: '',
  createdAt: '2026-07-16T10:00:00Z',
  attachment: {
    id: 'att-video',
    messageId: 'm-video',
    conversationId: 'conv-1',
    uploaderId: 'user-1',
    mediaType: 'video',
    storagePath: 'conv-1/user-1/clip.mp4',
    mimeType: 'video/mp4',
    sizeBytes: 2_000_000,
    width: 1280,
    height: 720,
    durationMs: 15_000,
    createdAt: '2026-07-16T10:00:00Z',
  },
};

describe('MessageBubble — vidéo, menu ⋮ et suppression', () => {
  it('affiche le bouton ⋮ sur sa propre vidéo, avec le bon accessibilityLabel', async () => {
    await render(<MessageBubble message={videoMessage} isOwnMessage onDelete={jest.fn()} onRetryDelete={jest.fn()} />);

    expect(await screen.findByLabelText('Options du message vidéo')).toBeTruthy();
  });

  it("n'affiche aucun bouton ⋮ ni aucune option de suppression sur une vidéo reçue", async () => {
    await render(
      <MessageBubble message={videoMessage} isOwnMessage={false} onDelete={jest.fn()} onRetryDelete={jest.fn()} />,
    );

    expect(screen.queryByLabelText('Options du message vidéo')).toBeNull();
    expect(screen.queryByText('Supprimer')).toBeNull();
  });

  it('ouvre le menu (Supprimer visible) au tap sur ⋮, malgré la présence de MessageVideo', async () => {
    await render(<MessageBubble message={videoMessage} isOwnMessage onDelete={jest.fn()} onRetryDelete={jest.fn()} />);

    expect(screen.queryByText('Supprimer')).toBeNull();

    fireEvent.press(await screen.findByLabelText('Options du message vidéo'));

    expect(await screen.findByText('Supprimer')).toBeTruthy();
  });

  it('demande confirmation avant toute suppression, sans appeler onDelete tant que non confirmé', async () => {
    const onDelete = jest.fn();
    await render(<MessageBubble message={videoMessage} isOwnMessage onDelete={onDelete} onRetryDelete={jest.fn()} />);

    fireEvent.press(await screen.findByLabelText('Options du message vidéo'));
    fireEvent.press(await screen.findByText('Supprimer'));

    expect(await screen.findByText('Supprimer ce message ?')).toBeTruthy();
    expect(screen.getByText('Confirmer')).toBeTruthy();
    expect(screen.getByText('Annuler')).toBeTruthy();
    expect(onDelete).not.toHaveBeenCalled();
  });

  it('un seul appel à onDelete après confirmation ; le bouton Confirmer disparaît aussitôt (protège du double appui)', async () => {
    const onDelete = jest.fn();
    await render(<MessageBubble message={videoMessage} isOwnMessage onDelete={onDelete} onRetryDelete={jest.fn()} />);

    fireEvent.press(await screen.findByLabelText('Options du message vidéo'));
    fireEvent.press(await screen.findByText('Supprimer'));
    fireEvent.press(await screen.findByText('Confirmer'));

    expect(onDelete).toHaveBeenCalledTimes(1);
    // Le bouton Confirmer n'existe plus : un second appui réel n'a plus rien à toucher.
    await waitFor(() => expect(screen.queryByText('Confirmer')).toBeNull());
  });

  it('Annuler referme la confirmation sans jamais appeler onDelete', async () => {
    const onDelete = jest.fn();
    await render(<MessageBubble message={videoMessage} isOwnMessage onDelete={onDelete} onRetryDelete={jest.fn()} />);

    fireEvent.press(await screen.findByLabelText('Options du message vidéo'));
    fireEvent.press(await screen.findByText('Supprimer'));
    fireEvent.press(await screen.findByText('Annuler'));

    expect(onDelete).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByText('Supprimer ce message ?')).toBeNull());
  });

  it('affiche « Suppression… » pendant la suppression', async () => {
    await render(
      <MessageBubble
        message={videoMessage}
        isOwnMessage
        deletionState={{ status: 'deleting', error: null }}
        onDelete={jest.fn()}
        onRetryDelete={jest.fn()}
      />,
    );

    expect(await screen.findByText('Suppression…')).toBeTruthy();
  });

  it("affiche l'erreur et le bouton Réessayer sur sa propre vidéo en échec, et appelle onRetryDelete au tap", async () => {
    const onRetryDelete = jest.fn();
    await render(
      <MessageBubble
        message={videoMessage}
        isOwnMessage
        deletionState={{ status: 'error', error: 'Impossible de supprimer le fichier pour le moment.' }}
        onDelete={jest.fn()}
        onRetryDelete={onRetryDelete}
      />,
    );

    expect(await screen.findByText('Impossible de supprimer le fichier pour le moment.')).toBeTruthy();
    fireEvent.press(screen.getByText('Réessayer'));

    expect(onRetryDelete).toHaveBeenCalledTimes(1);
  });

  it('le menu ⋮ se ferme après avoir choisi Supprimer (pas de doublon visuel avec la confirmation)', async () => {
    await render(<MessageBubble message={videoMessage} isOwnMessage onDelete={jest.fn()} onRetryDelete={jest.fn()} />);

    fireEvent.press(await screen.findByLabelText('Options du message vidéo'));
    fireEvent.press(await screen.findByText('Supprimer'));

    // Un seul « Supprimer » dans l'arbre (celui du menu a disparu, remplacé
    // par la confirmation) : pas de recouvrement des deux états à la fois.
    await screen.findByText('Supprimer ce message ?');
    expect(screen.queryAllByText('Supprimer')).toHaveLength(0);
    // Le bouton ⋮ lui-même a aussi disparu : un seul point d'action à la fois.
    expect(screen.queryByLabelText('Options du message vidéo')).toBeNull();
  });

  it('masque le bouton ⋮ pendant la suppression (« Suppression… »)', async () => {
    await render(
      <MessageBubble
        message={videoMessage}
        isOwnMessage
        deletionState={{ status: 'deleting', error: null }}
        onDelete={jest.fn()}
        onRetryDelete={jest.fn()}
      />,
    );

    await screen.findByText('Suppression…');
    expect(screen.queryByLabelText('Options du message vidéo')).toBeNull();
  });

  it('masque le bouton ⋮ en état d’échec (Réessayer déjà proposé)', async () => {
    await render(
      <MessageBubble
        message={videoMessage}
        isOwnMessage
        deletionState={{ status: 'error', error: 'Impossible de supprimer le fichier pour le moment.' }}
        onDelete={jest.fn()}
        onRetryDelete={jest.fn()}
      />,
    );

    await screen.findByText('Réessayer');
    expect(screen.queryByLabelText('Options du message vidéo')).toBeNull();
  });
});

describe('MessageBubble — messages texte et photo (non régression)', () => {
  it('conserve le lien « Supprimer » simple (sans menu ⋮) pour un message texte', async () => {
    const onDelete = jest.fn();
    await render(<MessageBubble message={textMessage} isOwnMessage onDelete={onDelete} onRetryDelete={jest.fn()} />);

    expect(screen.queryByLabelText('Options du message vidéo')).toBeNull();
    fireEvent.press(await screen.findByText('Supprimer'));
    fireEvent.press(await screen.findByText('Confirmer'));

    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it("n'affiche aucune option de suppression sur un message texte reçu (d'un autre utilisateur)", async () => {
    await render(
      <MessageBubble message={textMessage} isOwnMessage={false} onDelete={jest.fn()} onRetryDelete={jest.fn()} />,
    );

    expect(screen.queryByText('Supprimer')).toBeNull();
  });
});

describe('MessageBubble — Design System sombre imposé (Anomalie 2, build 16)', () => {
  it(
    "utilise la bulle vert forêt sombre (Colors.dark.accent) pour un message envoyé, " +
      "même si le thème système (par défaut clair dans cet environnement de test) diffère",
    async () => {
      await render(<MessageBubble message={textMessage} isOwnMessage onDelete={jest.fn()} onRetryDelete={jest.fn()} />);

      const bubble = screen.getByText('Salut').parent;
      expect(flattenStyle(bubble?.props.style).backgroundColor).toBe(Colors.dark.accent);
    },
  );

  it('utilise la bulle gris pierre sombre (Colors.dark.surfaceHigh) pour un message reçu', async () => {
    await render(
      <MessageBubble message={textMessage} isOwnMessage={false} onDelete={jest.fn()} onRetryDelete={jest.fn()} />,
    );

    const bubble = screen.getByText('Salut').parent;
    expect(flattenStyle(bubble?.props.style).backgroundColor).toBe(Colors.dark.surfaceHigh);
  });
});

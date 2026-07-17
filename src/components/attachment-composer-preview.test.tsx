import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { AttachmentComposerPreview } from '@/components/attachment-composer-preview';
import type { PickedMedia } from '@/services/media';

const imageMedia: PickedMedia = {
  kind: 'image',
  data: { uri: 'file:///photo.jpg', mimeType: 'image/jpeg', sizeBytes: 1000, width: 100, height: 100 },
};

const videoMedia: PickedMedia = {
  kind: 'video',
  data: { uri: 'file:///clip.mp4', mimeType: 'video/mp4', sizeBytes: 2_000_000, durationMs: 15_000, width: 1280, height: 720 },
};

describe('AttachmentComposerPreview — photo', () => {
  it('affiche Annuler/Envoyer et déclenche les bons callbacks', async () => {
    const onCancel = jest.fn();
    const onSend = jest.fn();
    await render(
      <AttachmentComposerPreview
        media={imageMedia}
        isUploading={false}
        uploadProgress={null}
        error={null}
        onCancel={onCancel}
        onCancelUpload={jest.fn()}
        onSend={onSend}
      />,
    );

    await act(async () => {
      fireEvent.press(screen.getByText('Annuler'));
      await Promise.resolve();
    });
    expect(onCancel).toHaveBeenCalledTimes(1);

    await act(async () => {
      fireEvent.press(screen.getByText('Envoyer'));
      await Promise.resolve();
    });
    expect(onSend).toHaveBeenCalledTimes(1);
  });
});

describe('AttachmentComposerPreview — vidéo et upload', () => {
  it('affiche la progression pendant un upload', async () => {
    await render(
      <AttachmentComposerPreview
        media={videoMedia}
        isUploading
        uploadProgress={42}
        error={null}
        onCancel={jest.fn()}
        onCancelUpload={jest.fn()}
        onSend={jest.fn()}
      />,
    );

    expect(screen.getByText('0:15 · 1.9 Mo')).toBeTruthy();
  });

  it("le bouton Annuler l'envoi appelle onCancelUpload pendant l'upload vidéo", async () => {
    const onCancelUpload = jest.fn();
    await render(
      <AttachmentComposerPreview
        media={videoMedia}
        isUploading
        uploadProgress={10}
        error={null}
        onCancel={jest.fn()}
        onCancelUpload={onCancelUpload}
        onSend={jest.fn()}
      />,
    );

    await act(async () => {
      fireEvent.press(screen.getByText('Annuler l’envoi'));
      await Promise.resolve();
    });
    expect(onCancelUpload).toHaveBeenCalledTimes(1);
  });

  it('après une erreur, le bouton Envoyer devient Réessayer et relance onSend', async () => {
    const onSend = jest.fn();
    await render(
      <AttachmentComposerPreview
        media={videoMedia}
        isUploading={false}
        uploadProgress={30}
        error="Envoi interrompu. Réessaie."
        onCancel={jest.fn()}
        onCancelUpload={jest.fn()}
        onSend={onSend}
      />,
    );

    expect(screen.getByText('Envoi interrompu. Réessaie.')).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByText('Réessayer'));
      await Promise.resolve();
    });
    expect(onSend).toHaveBeenCalledTimes(1);
  });

  it('le bouton Annuler est désactivé pendant un upload en cours', async () => {
    await render(
      <AttachmentComposerPreview
        media={imageMedia}
        isUploading
        uploadProgress={null}
        error={null}
        onCancel={jest.fn()}
        onCancelUpload={jest.fn()}
        onSend={jest.fn()}
      />,
    );

    expect(screen.getByLabelText('Annuler').props.accessibilityState).toEqual(
      expect.objectContaining({ disabled: true }),
    );
  });
});

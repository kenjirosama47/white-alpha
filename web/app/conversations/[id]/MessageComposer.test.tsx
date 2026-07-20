import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

import type { MediaUploadResult } from '@/lib/media-upload-client';
import * as mediaUploadClient from '@/lib/media-upload-client';

import { MessageComposer } from './MessageComposer';

jest.mock('@/lib/media-upload-client', () => {
  const actual = jest.requireActual('@/lib/media-upload-client');
  return {
    ...actual,
    uploadMediaAttachment: jest.fn(),
    probeVideoDurationMs: jest.fn(),
  };
});

const mockUploadMediaAttachment = mediaUploadClient.uploadMediaAttachment as jest.Mock;

function makeImageFile(name = 'photo.jpg', type = 'image/jpeg'): File {
  return new File([new Uint8Array(16)], name, { type });
}

function selectPhoto(file: File) {
  fireEvent.click(screen.getByRole('button', { name: 'Ajouter une pièce jointe' }));
  fireEvent.click(screen.getByRole('menuitem', { name: 'Photo' }));
  const input = screen.getByLabelText('Choisir une photo') as HTMLInputElement;
  fireEvent.change(input, { target: { files: [file] } });
}

const successBody: MediaUploadResult = {
  ok: true,
  message: { id: 'm1', conversationId: 'c1', senderId: 'u1', content: '', messageType: 'image', createdAt: '2026-01-01T00:00:00Z' },
};

describe('MessageComposer (Phase 8.4/8.5.3)', () => {
  beforeEach(() => {
    mockUploadMediaAttachment.mockReset();
  });

  describe('texte seul (Phase 8.4, non-régression)', () => {
    it('message vide refusé : le bouton envoyer reste désactivé, onSend jamais appelé', () => {
      const onSend = jest.fn();
      render(<MessageComposer conversationId="c1" disabled={false} onSend={onSend} />);

      const sendButton = screen.getByRole('button', { name: 'Envoyer le message' });
      expect(sendButton).toBeDisabled();

      fireEvent.click(sendButton);
      expect(onSend).not.toHaveBeenCalled();
    });

    it('espaces uniquement : refusé (contenu normalisé avant vérification)', () => {
      const onSend = jest.fn();
      render(<MessageComposer conversationId="c1" disabled={false} onSend={onSend} />);

      fireEvent.change(screen.getByLabelText('Message'), { target: { value: '   ' } });
      expect(screen.getByRole('button', { name: 'Envoyer le message' })).toBeDisabled();
    });

    it('Entrée envoie le message, Maj+Entrée insère un saut de ligne', () => {
      const onSend = jest.fn();
      render(<MessageComposer conversationId="c1" disabled={false} onSend={onSend} />);

      const textarea = screen.getByLabelText('Message');
      fireEvent.change(textarea, { target: { value: 'Salut' } });

      fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: true });
      expect(onSend).not.toHaveBeenCalled();

      fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });
      expect(onSend).toHaveBeenCalledWith('Salut');
    });

    it('envoi réussi : le champ est vidé après l’envoi', () => {
      const onSend = jest.fn();
      render(<MessageComposer conversationId="c1" disabled={false} onSend={onSend} />);

      const textarea = screen.getByLabelText('Message') as HTMLTextAreaElement;
      fireEvent.change(textarea, { target: { value: 'Salut' } });
      fireEvent.click(screen.getByRole('button', { name: 'Envoyer le message' }));

      expect(textarea.value).toBe('');
    });

    it('texte normalisé (trim) transmis à onSend', () => {
      const onSend = jest.fn();
      render(<MessageComposer conversationId="c1" disabled={false} onSend={onSend} />);

      fireEvent.change(screen.getByLabelText('Message'), { target: { value: '  Salut  ' } });
      fireEvent.click(screen.getByRole('button', { name: 'Envoyer le message' }));

      expect(onSend).toHaveBeenCalledWith('Salut');
    });

    it('disabled=true (envoi en cours ou hors connexion) : champ et bouton désactivés, double envoi bloqué', () => {
      const onSend = jest.fn();
      render(<MessageComposer conversationId="c1" disabled={true} onSend={onSend} />);

      expect(screen.getByLabelText('Message')).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Envoyer le message' })).toBeDisabled();

      fireEvent.click(screen.getByRole('button', { name: 'Envoyer le message' }));
      expect(onSend).not.toHaveBeenCalled();
    });
  });

  describe('média seul et texte + média (Phase 8.5.3)', () => {
    it('aperçu créé après sélection d’une image', () => {
      render(<MessageComposer conversationId="c1" disabled={false} onSend={jest.fn()} />);
      selectPhoto(makeImageFile());

      expect(screen.getByRole('button', { name: 'Annuler' })).toBeInTheDocument();
    });

    it('média seul (aucun texte) : envoyé via la route média avec une légende vide', () => {
      const uploadPromise = new Promise<MediaUploadResult>(() => {});
      mockUploadMediaAttachment.mockReturnValue({ promise: uploadPromise, xhr: {} as XMLHttpRequest });

      const onSend = jest.fn();
      render(<MessageComposer conversationId="c1" disabled={false} onSend={onSend} />);
      selectPhoto(makeImageFile());

      fireEvent.click(screen.getByRole('button', { name: 'Envoyer le message' }));

      expect(mockUploadMediaAttachment).toHaveBeenCalledWith(
        'c1',
        expect.any(File),
        '',
        expect.any(String),
        null,
        expect.any(Function),
        expect.any(Function),
      );
      // Jamais le flux texte seul (Phase 8.4) en parallèle : un seul message créé.
      expect(onSend).not.toHaveBeenCalled();
    });

    it('texte + média : la légende tapée est transmise, un seul envoi (jamais deux messages séparés)', () => {
      const uploadPromise = new Promise<MediaUploadResult>(() => {});
      mockUploadMediaAttachment.mockReturnValue({ promise: uploadPromise, xhr: {} as XMLHttpRequest });

      const onSend = jest.fn();
      render(<MessageComposer conversationId="c1" disabled={false} onSend={onSend} />);
      selectPhoto(makeImageFile());
      fireEvent.change(screen.getByLabelText('Message'), { target: { value: '  Regarde ça  ' } });

      fireEvent.click(screen.getByRole('button', { name: 'Envoyer le message' }));

      expect(mockUploadMediaAttachment).toHaveBeenCalledWith(
        'c1',
        expect.any(File),
        'Regarde ça',
        expect.any(String),
        null,
        expect.any(Function),
        expect.any(Function),
      );
      expect(mockUploadMediaAttachment).toHaveBeenCalledTimes(1);
      expect(onSend).not.toHaveBeenCalled();
    });

    it('bouton Envoyer désactivé pendant l’upload', () => {
      const uploadPromise = new Promise<MediaUploadResult>(() => {});
      mockUploadMediaAttachment.mockReturnValue({ promise: uploadPromise, xhr: {} as XMLHttpRequest });

      render(<MessageComposer conversationId="c1" disabled={false} onSend={jest.fn()} />);
      selectPhoto(makeImageFile());
      fireEvent.click(screen.getByRole('button', { name: 'Envoyer le message' }));

      expect(screen.getByRole('button', { name: 'Envoyer le message' })).toBeDisabled();
    });

    it('double clic sur Envoyer : un seul appel réseau', () => {
      const uploadPromise = new Promise<MediaUploadResult>(() => {});
      mockUploadMediaAttachment.mockReturnValue({ promise: uploadPromise, xhr: {} as XMLHttpRequest });

      render(<MessageComposer conversationId="c1" disabled={false} onSend={jest.fn()} />);
      selectPhoto(makeImageFile());

      const sendButton = screen.getByRole('button', { name: 'Envoyer le message' });
      fireEvent.click(sendButton);
      fireEvent.click(sendButton);

      expect(mockUploadMediaAttachment).toHaveBeenCalledTimes(1);
    });

    it('progression affichée avec role="progressbar" et attributs ARIA corrects', () => {
      let capturedOnProgress: (percent: number) => void = () => {};
      mockUploadMediaAttachment.mockImplementation((_c, _f, _cap, _key, _dur, onProgress) => {
        capturedOnProgress = onProgress;
        return { promise: new Promise<MediaUploadResult>(() => {}), xhr: {} as XMLHttpRequest };
      });

      render(<MessageComposer conversationId="c1" disabled={false} onSend={jest.fn()} />);
      selectPhoto(makeImageFile());
      fireEvent.click(screen.getByRole('button', { name: 'Envoyer le message' }));

      act(() => capturedOnProgress(55));

      const progressbar = screen.getByRole('progressbar', { name: "Progression de l'envoi" });
      expect(progressbar).toHaveAttribute('aria-valuemin', '0');
      expect(progressbar).toHaveAttribute('aria-valuemax', '100');
      expect(progressbar).toHaveAttribute('aria-valuenow', '55');
      expect(screen.getByText('55%')).toBeInTheDocument();
    });

    it('échec : message générique affiché, jamais un détail brut', async () => {
      mockUploadMediaAttachment.mockReturnValue({
        promise: Promise.resolve<MediaUploadResult>({ ok: false, code: 'send_failed' }),
        xhr: {} as XMLHttpRequest,
      });

      render(<MessageComposer conversationId="c1" disabled={false} onSend={jest.fn()} />);
      selectPhoto(makeImageFile());
      fireEvent.click(screen.getByRole('button', { name: 'Envoyer le message' }));

      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent("Impossible d'envoyer le média pour le moment.");
      expect(alert.textContent).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}/i);
    });

    it('réessai après échec : réutilise la même clé d’idempotence', async () => {
      const capturedKeys: string[] = [];
      mockUploadMediaAttachment
        .mockImplementationOnce((_c, _f, _cap, key) => {
          capturedKeys.push(key);
          return { promise: Promise.resolve<MediaUploadResult>({ ok: false, code: 'network_error' }), xhr: {} as XMLHttpRequest };
        })
        .mockImplementationOnce((_c, _f, _cap, key) => {
          capturedKeys.push(key);
          return { promise: Promise.resolve<MediaUploadResult>(successBody), xhr: {} as XMLHttpRequest };
        });

      render(<MessageComposer conversationId="c1" disabled={false} onSend={jest.fn()} />);
      selectPhoto(makeImageFile());
      fireEvent.click(screen.getByRole('button', { name: 'Envoyer le message' }));

      await screen.findByRole('alert');
      fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }));

      await waitFor(() => expect(mockUploadMediaAttachment).toHaveBeenCalledTimes(2));
      expect(capturedKeys[0]).toBe(capturedKeys[1]);
    });

    it('annulation après échec : retire l’aperçu et l’erreur', async () => {
      mockUploadMediaAttachment.mockReturnValue({
        promise: Promise.resolve<MediaUploadResult>({ ok: false, code: 'upload_failed' }),
        xhr: {} as XMLHttpRequest,
      });

      render(<MessageComposer conversationId="c1" disabled={false} onSend={jest.fn()} />);
      selectPhoto(makeImageFile());
      fireEvent.click(screen.getByRole('button', { name: 'Envoyer le message' }));

      await screen.findByRole('alert');
      fireEvent.click(screen.getByRole('button', { name: 'Annuler' }));

      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Annuler' })).not.toBeInTheDocument();
    });

    it('succès : l’aperçu disparaît et le champ texte est vidé', async () => {
      mockUploadMediaAttachment.mockReturnValue({ promise: Promise.resolve<MediaUploadResult>(successBody), xhr: {} as XMLHttpRequest });

      render(<MessageComposer conversationId="c1" disabled={false} onSend={jest.fn()} />);
      selectPhoto(makeImageFile());
      fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Regarde' } });
      fireEvent.click(screen.getByRole('button', { name: 'Envoyer le message' }));

      await waitFor(() => expect((screen.getByLabelText('Message') as HTMLTextAreaElement).value).toBe(''));
      await waitFor(() => expect(screen.queryByRole('button', { name: 'Annuler' })).not.toBeInTheDocument(), { timeout: 3000 });
    });
  });

  describe('confidentialité locale (Phase 8.5.3)', () => {
    it('aucune référence à localStorage/sessionStorage/caches dans le code du composeur ou du hook', () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- lecture statique du code source, pas un import applicatif.
      const fs = require('node:fs') as typeof import('node:fs');
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const path = require('node:path') as typeof import('node:path');

      // Recherche l'USAGE réel de ces API (appel de méthode), jamais leur
      // simple mention : ce fichier documente lui-même explicitement dans ses
      // commentaires que ces stockages ne sont jamais utilisés, ce qui ferait
      // échouer un test cherchant seulement le mot.
      for (const file of ['MessageComposer.tsx', 'useAttachmentUpload.ts', 'AttachmentMenu.tsx', 'AttachmentPreview.tsx']) {
        const source = fs.readFileSync(path.join(__dirname, file), 'utf8');
        expect(source).not.toMatch(/localStorage\s*\.\s*(setItem|getItem)/);
        expect(source).not.toMatch(/sessionStorage\s*\.\s*(setItem|getItem)/);
        expect(source).not.toMatch(/caches\s*\.\s*(open|match|put)/);
      }
    });
  });
});

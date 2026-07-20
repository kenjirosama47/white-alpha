import { fireEvent, render, screen } from '@testing-library/react';

import { MessageComposer } from './MessageComposer';

describe('MessageComposer (Phase 8.4)', () => {
  it('message vide refusé : le bouton envoyer reste désactivé, onSend jamais appelé', () => {
    const onSend = jest.fn();
    render(<MessageComposer disabled={false} onSend={onSend} />);

    const sendButton = screen.getByRole('button', { name: 'Envoyer le message' });
    expect(sendButton).toBeDisabled();

    fireEvent.click(sendButton);
    expect(onSend).not.toHaveBeenCalled();
  });

  it('espaces uniquement : refusé (contenu normalisé avant vérification)', () => {
    const onSend = jest.fn();
    render(<MessageComposer disabled={false} onSend={onSend} />);

    const textarea = screen.getByLabelText('Message');
    fireEvent.change(textarea, { target: { value: '   ' } });

    const sendButton = screen.getByRole('button', { name: 'Envoyer le message' });
    expect(sendButton).toBeDisabled();
  });

  it('Entrée envoie le message, Maj+Entrée insère un saut de ligne', () => {
    const onSend = jest.fn();
    render(<MessageComposer disabled={false} onSend={onSend} />);

    const textarea = screen.getByLabelText('Message');
    fireEvent.change(textarea, { target: { value: 'Salut' } });

    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: true });
    expect(onSend).not.toHaveBeenCalled();

    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });
    expect(onSend).toHaveBeenCalledWith('Salut');
  });

  it('envoi réussi : le champ est vidé après l’envoi', () => {
    const onSend = jest.fn();
    render(<MessageComposer disabled={false} onSend={onSend} />);

    const textarea = screen.getByLabelText('Message') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'Salut' } });
    fireEvent.click(screen.getByRole('button', { name: 'Envoyer le message' }));

    expect(textarea.value).toBe('');
  });

  it('texte normalisé (trim) transmis à onSend', () => {
    const onSend = jest.fn();
    render(<MessageComposer disabled={false} onSend={onSend} />);

    const textarea = screen.getByLabelText('Message');
    fireEvent.change(textarea, { target: { value: '  Salut  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Envoyer le message' }));

    expect(onSend).toHaveBeenCalledWith('Salut');
  });

  it('disabled=true (envoi en cours ou hors connexion) : champ et bouton désactivés, double envoi bloqué', () => {
    const onSend = jest.fn();
    render(<MessageComposer disabled={true} onSend={onSend} />);

    const textarea = screen.getByLabelText('Message');
    const sendButton = screen.getByRole('button', { name: 'Envoyer le message' });

    expect(textarea).toBeDisabled();
    expect(sendButton).toBeDisabled();

    fireEvent.click(sendButton);
    expect(onSend).not.toHaveBeenCalled();
  });
});

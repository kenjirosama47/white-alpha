import { fireEvent, render, screen } from '@testing-library/react';

import { AttachmentMenu } from './AttachmentMenu';

function makeFile(name: string, type: string): File {
  return new File([new Uint8Array(16)], name, { type });
}

describe('AttachmentMenu (Phase 8.5.3)', () => {
  it('bouton trombone accessible : aria-haspopup/aria-expanded, fermé par défaut', () => {
    render(<AttachmentMenu disabled={false} onSelectImage={jest.fn()} onSelectVideo={jest.fn()} />);

    const trigger = screen.getByRole('button', { name: 'Ajouter une pièce jointe' });
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('clic sur le trombone ouvre le menu avec les deux entrées Photo/Vidéo', () => {
    render(<AttachmentMenu disabled={false} onSelectImage={jest.fn()} onSelectVideo={jest.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Ajouter une pièce jointe' }));

    expect(screen.getByRole('menu', { name: 'Type de pièce jointe' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Photo' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Vidéo' })).toBeInTheDocument();
  });

  it('navigation clavier : flèche bas/haut déplace le focus entre les entrées', () => {
    render(<AttachmentMenu disabled={false} onSelectImage={jest.fn()} onSelectVideo={jest.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter une pièce jointe' }));

    const photoItem = screen.getByRole('menuitem', { name: 'Photo' });
    const videoItem = screen.getByRole('menuitem', { name: 'Vidéo' });
    expect(photoItem).toHaveFocus();

    fireEvent.keyDown(photoItem, { key: 'ArrowDown' });
    expect(videoItem).toHaveFocus();

    fireEvent.keyDown(videoItem, { key: 'ArrowUp' });
    expect(photoItem).toHaveFocus();
  });

  it('Échap ferme le menu et rend le focus au bouton trombone', () => {
    render(<AttachmentMenu disabled={false} onSelectImage={jest.fn()} onSelectVideo={jest.fn()} />);
    const trigger = screen.getByRole('button', { name: 'Ajouter une pièce jointe' });
    fireEvent.click(trigger);
    expect(screen.getByRole('menu')).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('clic à l’extérieur ferme le menu', () => {
    render(
      <div>
        <AttachmentMenu disabled={false} onSelectImage={jest.fn()} onSelectVideo={jest.fn()} />
        <button type="button">Ailleurs</button>
      </div>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter une pièce jointe' }));
    expect(screen.getByRole('menu')).toBeInTheDocument();

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Ailleurs' }));

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('sélection Photo : ferme le menu et déclenche l’input photo (filtre accept image)', () => {
    const onSelectImage = jest.fn();
    render(<AttachmentMenu disabled={false} onSelectImage={onSelectImage} onSelectVideo={jest.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter une pièce jointe' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Photo' }));

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();

    const photoInput = screen.getByLabelText('Choisir une photo') as HTMLInputElement;
    expect(photoInput).toHaveAttribute('accept', 'image/jpeg,image/png,image/webp');

    const file = makeFile('photo.jpg', 'image/jpeg');
    fireEvent.change(photoInput, { target: { files: [file] } });
    expect(onSelectImage).toHaveBeenCalledWith(file);
  });

  it('sélection Vidéo : déclenche l’input vidéo (filtre accept vidéo)', () => {
    const onSelectVideo = jest.fn();
    render(<AttachmentMenu disabled={false} onSelectImage={jest.fn()} onSelectVideo={onSelectVideo} />);
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter une pièce jointe' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Vidéo' }));

    const videoInput = screen.getByLabelText('Choisir une vidéo') as HTMLInputElement;
    expect(videoInput).toHaveAttribute('accept', 'video/mp4,video/webm');

    const file = makeFile('video.mp4', 'video/mp4');
    fireEvent.change(videoInput, { target: { files: [file] } });
    expect(onSelectVideo).toHaveBeenCalledWith(file);
  });

  it('la valeur de l’input est réinitialisée après sélection (permet de re-choisir le même fichier)', () => {
    render(<AttachmentMenu disabled={false} onSelectImage={jest.fn()} onSelectVideo={jest.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter une pièce jointe' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Photo' }));

    const photoInput = screen.getByLabelText('Choisir une photo') as HTMLInputElement;
    fireEvent.change(photoInput, { target: { files: [makeFile('photo.jpg', 'image/jpeg')] } });

    expect(photoInput.value).toBe('');
  });

  it('disabled=true : le bouton trombone est désactivé', () => {
    render(<AttachmentMenu disabled={true} onSelectImage={jest.fn()} onSelectVideo={jest.fn()} />);
    expect(screen.getByRole('button', { name: 'Ajouter une pièce jointe' })).toBeDisabled();
  });
});

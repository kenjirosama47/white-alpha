import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { AttachmentMenu } from '@/components/attachment-menu';

// Correctif intégration (trombone, voir PLAN.md 9.1) : remplace les deux
// boutons Photo/Vidéo séparés par une seule icône ouvrant ce menu.
describe('AttachmentMenu', () => {
  it("n'affiche aucune option quand visible=false", async () => {
    await render(
      <AttachmentMenu visible={false} onClose={jest.fn()} onPickImage={jest.fn()} onPickVideo={jest.fn()} />,
    );

    expect(screen.queryByText('Photo')).toBeNull();
    expect(screen.queryByText('Vidéo')).toBeNull();
  });

  it('affiche Photo, Vidéo et Annuler quand visible=true', async () => {
    await render(
      <AttachmentMenu visible onClose={jest.fn()} onPickImage={jest.fn()} onPickVideo={jest.fn()} />,
    );

    expect(screen.getByText('Photo')).toBeTruthy();
    expect(screen.getByText('Vidéo')).toBeTruthy();
    expect(screen.getByText('Annuler')).toBeTruthy();
  });

  it('Photo : ferme le menu et appelle onPickImage', async () => {
    const onClose = jest.fn();
    const onPickImage = jest.fn();
    await render(<AttachmentMenu visible onClose={onClose} onPickImage={onPickImage} onPickVideo={jest.fn()} />);

    await act(async () => {
      fireEvent.press(screen.getByText('Photo'));
      await Promise.resolve();
    });

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onPickImage).toHaveBeenCalledTimes(1);
  });

  it('Vidéo : ferme le menu et appelle onPickVideo', async () => {
    const onClose = jest.fn();
    const onPickVideo = jest.fn();
    await render(<AttachmentMenu visible onClose={onClose} onPickImage={jest.fn()} onPickVideo={onPickVideo} />);

    await act(async () => {
      fireEvent.press(screen.getByText('Vidéo'));
      await Promise.resolve();
    });

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onPickVideo).toHaveBeenCalledTimes(1);
  });

  it('Annuler : ferme le menu sans déclencher de sélection', async () => {
    const onClose = jest.fn();
    const onPickImage = jest.fn();
    const onPickVideo = jest.fn();
    await render(<AttachmentMenu visible onClose={onClose} onPickImage={onPickImage} onPickVideo={onPickVideo} />);

    await act(async () => {
      fireEvent.press(screen.getByText('Annuler'));
      await Promise.resolve();
    });

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onPickImage).not.toHaveBeenCalled();
    expect(onPickVideo).not.toHaveBeenCalled();
  });
});

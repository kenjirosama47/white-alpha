import { fireEvent, render, screen } from '@testing-library/react-native';
import type { View } from 'react-native';

import { ImageViewerModal } from '@/components/image-viewer-modal';
import { restoreAccessibilityFocus } from '@/utils/accessibility-focus';

jest.mock('@/utils/accessibility-focus', () => ({
  restoreAccessibilityFocus: jest.fn(),
}));

const mockRestoreAccessibilityFocus = restoreAccessibilityFocus as jest.Mock;

describe('ImageViewerModal', () => {
  beforeEach(() => {
    mockRestoreAccessibilityFocus.mockReset();
  });

  it("n'affiche rien quand url est null", async () => {
    await render(<ImageViewerModal url={null} onClose={jest.fn()} />);

    expect(screen.queryByRole('button', { name: "Fermer l'image" })).toBeNull();
  });

  it('affiche l’image et un bouton fermer accessible', async () => {
    await render(<ImageViewerModal url="https://signed.example/a.jpg" onClose={jest.fn()} />);

    expect(screen.getByRole('button', { name: "Fermer l'image" })).toBeTruthy();
  });

  it('appelle onClose au tap sur le bouton fermer', async () => {
    const onClose = jest.fn();
    await render(<ImageViewerModal url="https://signed.example/a.jpg" onClose={onClose} />);

    fireEvent.press(screen.getByRole('button', { name: "Fermer l'image" }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('restaure le focus sur l’élément déclencheur (image) une fois la visionneuse refermée (Phase 7.6)', async () => {
    const triggerNode = { fakeImageNode: true } as unknown as View;
    const triggerRef = { current: triggerNode };
    await render(<ImageViewerModal url="https://signed.example/a.jpg" onClose={jest.fn()} triggerRef={triggerRef} />);

    fireEvent.press(screen.getByRole('button', { name: "Fermer l'image" }));

    expect(mockRestoreAccessibilityFocus).toHaveBeenCalledTimes(1);
    expect(mockRestoreAccessibilityFocus).toHaveBeenCalledWith(triggerNode);
  });

  it("ne plante jamais si aucun élément déclencheur n'est fourni (référence absente)", async () => {
    await render(<ImageViewerModal url="https://signed.example/a.jpg" onClose={jest.fn()} />);

    expect(() => fireEvent.press(screen.getByRole('button', { name: "Fermer l'image" }))).not.toThrow();
    expect(mockRestoreAccessibilityFocus).toHaveBeenCalledWith(null);
  });
});

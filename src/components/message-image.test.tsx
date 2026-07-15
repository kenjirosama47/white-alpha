import { fireEvent, render, screen } from '@testing-library/react-native';

import { MessageImage } from '@/components/message-image';

const mockRefresh = jest.fn();
let mockState: { url: string | null; isLoading: boolean; error: string | null };

jest.mock('@/hooks/use-signed-attachment-url', () => ({
  useSignedAttachmentUrl: () => ({ ...mockState, refresh: mockRefresh }),
}));

describe('MessageImage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('affiche un indicateur de chargement tant que l’URL signée n’est pas prête', async () => {
    mockState = { url: null, isLoading: true, error: null };

    await render(<MessageImage storagePath="conv-1/user-1/a.jpg" width={800} height={600} onPress={jest.fn()} />);

    expect(screen.getByTestId('message-image-loading')).toBeTruthy();
  });

  it('affiche une image reçue une fois l’URL signée chargée, et déclenche onPress avec cette URL', async () => {
    mockState = { url: 'https://signed.example/a.jpg', isLoading: false, error: null };
    const onPress = jest.fn();

    await render(<MessageImage storagePath="conv-1/user-1/a.jpg" width={800} height={600} onPress={onPress} />);

    fireEvent.press(screen.getByTestId('message-image-pressable'));

    expect(onPress).toHaveBeenCalledWith('https://signed.example/a.jpg');
  });

  it('affiche un état d’erreur avec possibilité de réessayer', async () => {
    mockState = { url: null, isLoading: false, error: "Impossible de charger l'image pour le moment." };

    await render(<MessageImage storagePath="conv-1/user-1/a.jpg" width={800} height={600} onPress={jest.fn()} />);

    fireEvent.press(screen.getByText('Image indisponible. Toucher pour réessayer.'));

    expect(mockRefresh).toHaveBeenCalledTimes(1);
  });
});

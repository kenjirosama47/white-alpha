import { fireEvent, render, screen } from '@testing-library/react-native';

import { ConversationListItem } from '@/components/conversation-list-item';
import type { ConversationSummary } from '@/types/chat';

const conversation: ConversationSummary = {
  conversationId: 'conv-1',
  otherParticipant: { id: 'u1', username: 'bob', displayName: 'Bob', avatarUrl: null },
  lastMessageContent: 'Salut !',
  lastMessageCreatedAt: '2026-07-16T10:00:00Z',
};

describe('ConversationListItem', () => {
  it('affiche le nom affiché, le dernier message et une heure', async () => {
    await render(<ConversationListItem conversation={conversation} onPress={jest.fn()} />);

    expect(screen.getByText('Bob')).toBeTruthy();
    expect(screen.getByText('Salut !')).toBeTruthy();
  });

  it("affiche un message de repli quand aucun message n'existe encore", async () => {
    await render(
      <ConversationListItem
        conversation={{ ...conversation, lastMessageContent: null, lastMessageCreatedAt: null }}
        onPress={jest.fn()}
      />,
    );

    expect(screen.getByText('Aucun message pour le moment')).toBeTruthy();
  });

  it('appelle onPress au toucher', async () => {
    const onPress = jest.fn();
    await render(<ConversationListItem conversation={conversation} onPress={onPress} />);

    fireEvent.press(screen.getByText('Bob'));

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('expose un accessibilityLabel décrivant la conversation', async () => {
    await render(<ConversationListItem conversation={conversation} onPress={jest.fn()} />);

    expect(screen.getByLabelText('Ouvrir la conversation avec Bob')).toBeTruthy();
  });
});

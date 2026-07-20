import Link from 'next/link';
import type { Metadata } from 'next';

import { Avatar } from '@/components/Avatar';
import { fetchMessagesPage, getConversationHeader } from '@/lib/conversations';
import { createClient } from '@/lib/supabase/server';

import { MessageThread } from './MessageThread';
import styles from './page.module.css';

// Jamais de titre dynamique avec le nom du contact : la barre d'onglet et
// l'historique de navigation du navigateur ne doivent jamais révéler avec
// qui une conversation a lieu.
export const metadata: Metadata = {
  title: 'Discussion — White Alpha',
  robots: { index: false, follow: false },
};

type ConversationPageProps = {
  params: Promise<{ id: string }>;
};

/**
 * Écran de discussion (Phase 8.4). Le middleware protège déjà `/conversations`
 * (voir `proxy.ts`), mais on revérifie ici en profondeur de défense — même
 * politique que `/membre`/`/profil`. `getConversationHeader` revalide en
 * plus l'appartenance à CETTE conversation précise (RPC
 * `get_conversation_for_notification`) : zéro ligne = accès refusé ou
 * conversation inexistante, jamais distingué.
 */
export default async function ConversationPage({ params }: ConversationPageProps) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <div className={styles.notFound}>
        <p>Session introuvable.</p>
      </div>
    );
  }

  const header = await getConversationHeader(id);
  if (!header) {
    return (
      <div className={styles.notFound}>
        <p>Conversation introuvable.</p>
        <Link href="/conversations">Retour aux conversations</Link>
      </div>
    );
  }

  const initialMessages = await fetchMessagesPage(id);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link href="/conversations" className={styles.backButton} aria-label="Retour aux conversations">
          <span aria-hidden="true">←</span>
        </Link>
        <Avatar avatarUrl={header.avatarUrl} avatarPreset={header.avatarPreset} displayName={header.displayName} size={40} />
        <span className={styles.headerName}>{header.displayName}</span>
      </header>

      <MessageThread conversationId={id} header={header} initialMessages={initialMessages} currentUserId={user.id} />
    </div>
  );
}

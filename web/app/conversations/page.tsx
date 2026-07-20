import Link from 'next/link';
import type { Metadata } from 'next';

import { PageShell } from '@/components/PageShell';

import { ConversationList } from './ConversationList';
import styles from './page.module.css';

export const metadata: Metadata = {
  title: 'Conversations — White Alpha',
  robots: { index: false, follow: false },
};

export default function ConversationsPage() {
  return (
    <PageShell>
      <div className={styles.header}>
        <h1>Conversations</h1>
        <Link href="/conversations/nouvelle" className={styles.newLink}>
          Nouvelle conversation
        </Link>
      </div>
      <ConversationList />
    </PageShell>
  );
}

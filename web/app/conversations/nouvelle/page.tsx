import type { Metadata } from 'next';

import { PageShell } from '@/components/PageShell';

import { SearchForm } from './SearchForm';

export const metadata: Metadata = {
  title: 'Nouvelle conversation — White Alpha',
  robots: { index: false, follow: false },
};

export default function NewConversationPage() {
  return (
    <PageShell>
      <h1>Nouvelle conversation</h1>
      <SearchForm />
    </PageShell>
  );
}

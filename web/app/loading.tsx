import { PageShell } from '@/components/PageShell';

/** État de chargement global (convention App Router `loading.tsx`) — jamais un écran blanc. */
export default function Loading() {
  return (
    <PageShell>
      <p role="status" aria-live="polite">
        Chargement…
      </p>
    </PageShell>
  );
}

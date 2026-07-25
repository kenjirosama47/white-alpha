'use client';

import { useRef, useState } from 'react';

import { Button } from '@/components/Button';
import { FormError } from '@/components/FormError';
import formStyles from '@/styles/form.module.css';

import { generateInvitationCodeAction, listInvitationCodesAction, revokeInvitationCodeAction, type InvitationRow } from './actions';
import styles from './page.module.css';

const STATUS_LABEL: Record<InvitationRow['status'], string> = {
  active: 'Actif',
  used: 'Utilisé',
  expired: 'Expiré',
  revoked: 'Révoqué',
};

// `?? ''` : le module CSS est typé via un index signature (`noUncheckedIndexedAccess`
// le rend `string | undefined`), jamais réellement absent à l'exécution — les classes
// existent toutes dans page.module.css.
const STATUS_CLASS: Record<InvitationRow['status'], string> = {
  active: styles.statusActive ?? '',
  used: styles.statusUsed ?? '',
  expired: styles.statusExpired ?? '',
  revoked: styles.statusRevoked ?? '',
};

type GeneratedCode = { code: string; expiresAt: string; maxUses: number };

function formatDate(value: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
}

export function InvitationAdminClient({ initialInvitations }: { initialInvitations: InvitationRow[] }) {
  const [invitations, setInvitations] = useState(initialInvitations);
  const [listError, setListError] = useState<string | null>(null);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [generatedCode, setGeneratedCode] = useState<GeneratedCode | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  async function refreshList() {
    const result = await listInvitationCodesAction();
    if (result.ok) {
      setInvitations(result.invitations);
      setListError(null);
    } else {
      setListError(result.error);
    }
  }

  // Gestionnaire manuel (plutôt que useActionState) : la liste doit être
  // rafraîchie DEPUIS LE SERVEUR juste après une génération réussie (statut
  // calculé par admin_list_invitation_codes, jamais reconstruit côté
  // client) — fait ici, dans le même geste utilisateur, jamais dans un
  // useEffect déclenchant un setState en cascade.
  async function handleGenerate(formData: FormData) {
    setIsGenerating(true);
    setGenerateError(null);
    const result = await generateInvitationCodeAction({ status: 'idle' }, formData);
    if (result.status === 'success') {
      setGeneratedCode({ code: result.code, expiresAt: result.expiresAt, maxUses: result.maxUses });
      formRef.current?.reset();
      await refreshList();
    } else if (result.status === 'error') {
      setGenerateError(result.error);
    }
    setIsGenerating(false);
  }

  async function handleRevoke(id: string) {
    setRevokingId(id);
    const result = await revokeInvitationCodeAction(id);
    if (result.ok) {
      await refreshList();
    } else {
      setListError(result.error ?? null);
    }
    setRevokingId(null);
  }

  return (
    <div>
      <form ref={formRef} action={handleGenerate} className={styles.form}>
        <div className={styles.field}>
          <label className={formStyles.label} htmlFor="expiresInDays">
            Validité (jours)
          </label>
          <input
            id="expiresInDays"
            name="expiresInDays"
            type="number"
            min={1}
            max={365}
            defaultValue={7}
            required
            className={formStyles.input}
            disabled={isGenerating}
          />
        </div>

        <div className={styles.field}>
          <label className={formStyles.label} htmlFor="maxUses">
            Nombre d&apos;utilisations maximum
          </label>
          <input
            id="maxUses"
            name="maxUses"
            type="number"
            min={1}
            max={1000}
            defaultValue={1}
            required
            className={formStyles.input}
            disabled={isGenerating}
          />
        </div>

        <div className={styles.field}>
          <label className={formStyles.label} htmlFor="note">
            Note (optionnel, visible uniquement par vous)
          </label>
          <input id="note" name="note" type="text" maxLength={200} className={formStyles.input} disabled={isGenerating} />
        </div>

        <FormError message={generateError} />

        <Button type="submit" disabled={isGenerating}>
          {isGenerating ? 'Génération…' : 'Générer un code'}
        </Button>
      </form>

      {generatedCode && (
        <div className={styles.codeReveal} role="status">
          <p>
            Code généré — <strong>copiez-le maintenant, il ne sera plus jamais affiché :</strong>
          </p>
          <p className={styles.codeValue}>{generatedCode.code}</p>
          <p>
            Expire le {formatDate(generatedCode.expiresAt)} — {generatedCode.maxUses} utilisation(s) maximum.
          </p>
        </div>
      )}

      <FormError message={listError} />

      <table className={styles.table}>
        <thead>
          <tr>
            <th>Créé le</th>
            <th>Statut</th>
            <th>Expire le</th>
            <th>Utilisations</th>
            <th>Invité(e)</th>
            <th>Note</th>
            <th aria-label="Actions" />
          </tr>
        </thead>
        <tbody>
          {invitations.map((invitation) => (
            <tr key={invitation.id}>
              <td>{formatDate(invitation.createdAt)}</td>
              <td>
                <span className={`${styles.statusBadge} ${STATUS_CLASS[invitation.status]}`}>{STATUS_LABEL[invitation.status]}</span>
              </td>
              <td>{formatDate(invitation.expiresAt)}</td>
              <td>
                {invitation.useCount} / {invitation.maxUses}
              </td>
              <td>{invitation.usedByUsername ?? '—'}</td>
              <td>{invitation.note ?? '—'}</td>
              <td>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={invitation.status !== 'active' || revokingId === invitation.id}
                  onClick={() => handleRevoke(invitation.id)}
                >
                  {revokingId === invitation.id ? 'Révocation…' : 'Révoquer'}
                </Button>
              </td>
            </tr>
          ))}
          {invitations.length === 0 && (
            <tr>
              <td colSpan={7}>Aucun code d&apos;invitation pour l&apos;instant.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

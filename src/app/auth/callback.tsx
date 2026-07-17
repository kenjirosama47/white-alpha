import { useURL } from 'expo-linking';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { supabase } from '@/lib/supabase';

type Status = 'processing' | 'success' | 'error';

const ERROR_CODE_MESSAGES: Record<string, string> = {
  otp_expired: 'Ce lien de confirmation a expiré. Demande un nouvel email depuis l\'écran d\'inscription.',
  access_denied: 'Ce lien de confirmation est invalide ou a déjà été utilisé.',
};

// Un lien Supabase peut porter ses paramètres après `?` (PKCE / erreurs) ou
// après `#` (flux implicite avec access_token/refresh_token) : on fusionne les deux.
function extractParams(url: string): Record<string, string> {
  const params: Record<string, string> = {};
  const segments = url.split(/[?#]/).slice(1);
  for (const segment of segments) {
    for (const pair of segment.split('&')) {
      if (!pair) continue;
      const [rawKey, rawValue = ''] = pair.split('=');
      if (!rawKey) continue;
      try {
        params[decodeURIComponent(rawKey)] = decodeURIComponent(rawValue.replace(/\+/g, ' '));
      } catch {
        // Ignore un segment mal encodé plutôt que de faire planter le parsing.
      }
    }
  }
  return params;
}

export default function AuthCallbackScreen() {
  const theme = useTheme();
  const url = useURL();
  const [status, setStatus] = useState<Status>('processing');
  const [message, setMessage] = useState<string | null>(null);
  const handledUrl = useRef<string | null>(null);

  useEffect(() => {
    if (!url || handledUrl.current === url) return;
    handledUrl.current = url;

    async function handle() {
      const params = extractParams(url!);

      if (params.error) {
        setStatus('error');
        setMessage(
          ERROR_CODE_MESSAGES[params.error_code] ??
            'Impossible de confirmer ce lien. Merci de réessayer.',
        );
        return;
      }

      // Une session de récupération de mot de passe (`type=recovery`) doit
      // toujours mener à l'écran de réinitialisation, jamais directement aux
      // conversations — même si `setSession`/`verifyOtp` établit une session
      // valide au sens de Supabase Auth (voir Phase 7.3, reset-password.tsx,
      // placé volontairement hors du groupe (auth) pour rester accessible
      // malgré cette session déjà "authentifiée").
      const isRecovery = params.type === 'recovery';

      try {
        if (params.access_token && params.refresh_token) {
          const { error } = await supabase.auth.setSession({
            access_token: params.access_token,
            refresh_token: params.refresh_token,
          });
          if (error) throw error;
        } else if (params.code) {
          const { error } = await supabase.auth.exchangeCodeForSession(params.code);
          if (error) throw error;
        } else if (params.token_hash && params.type) {
          const { error } = await supabase.auth.verifyOtp({
            token_hash: params.token_hash,
            type: params.type as 'signup' | 'email' | 'magiclink' | 'recovery' | 'invite',
          });
          if (error) throw error;
        } else {
          setStatus('error');
          setMessage('Ce lien de confirmation est incomplet ou invalide.');
          return;
        }

        setStatus('success');
        setMessage(isRecovery ? 'Identité confirmée. Redirection...' : 'Compte confirmé. Redirection...');
        router.replace(isRecovery ? '/auth/reset-password' : '/');
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Erreur inconnue';
        setStatus('error');
        setMessage(
          errorMessage.includes('expired')
            ? "Ce lien de confirmation a expiré. Demande un nouvel email depuis l'écran d'inscription."
            : 'Impossible de confirmer ce lien. Merci de réessayer.',
        );
      }
    }

    handle();
  }, [url]);

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        {status === 'processing' && (
          <>
            <ActivityIndicator size="large" color={theme.accent} />
            <ThemedText type="subtitle" style={styles.text}>
              Confirmation en cours...
            </ThemedText>
          </>
        )}

        {status === 'success' && (
          <ThemedText type="subtitle" style={styles.text}>
            {message}
          </ThemedText>
        )}

        {status === 'error' && (
          <>
            <ThemedText type="subtitle" style={styles.text}>
              Confirmation impossible
            </ThemedText>
            <ThemedText type="body" themeColor="textSecondary" style={styles.text}>
              {message}
            </ThemedText>
            <Button label="Retour à la connexion" onPress={() => router.replace('/login')} />
          </>
        )}
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    flexDirection: 'row',
  },
  safeArea: {
    flex: 1,
    paddingHorizontal: Spacing.four,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.four,
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    width: '100%',
  },
  text: {
    textAlign: 'center',
  },
});

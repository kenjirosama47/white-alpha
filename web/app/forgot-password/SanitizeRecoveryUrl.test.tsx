import { render } from '@testing-library/react';

import { SanitizeRecoveryUrl } from './SanitizeRecoveryUrl';

const mockReplace = jest.fn();
let mockSearchParams = new URLSearchParams();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace }),
  useSearchParams: () => mockSearchParams,
}));

describe('SanitizeRecoveryUrl (Phase 8.4 — nettoyage de l’URL de récupération)', () => {
  beforeEach(() => {
    mockReplace.mockReset();
  });

  it('URL propre (reason=link_expired uniquement) : ne touche jamais à l’URL', () => {
    mockSearchParams = new URLSearchParams('reason=link_expired');

    render(<SanitizeRecoveryUrl />);

    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('URL portant error/error_code/error_description : nettoie vers /forgot-password?reason=link_expired uniquement', () => {
    mockSearchParams = new URLSearchParams(
      'error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired&reason=link_expired',
    );

    render(<SanitizeRecoveryUrl />);

    expect(mockReplace).toHaveBeenCalledWith('/forgot-password?reason=link_expired');
  });

  it('URL portant token/token_hash/code/type : nettoyée même sans reason', () => {
    mockSearchParams = new URLSearchParams('token_hash=xyz&type=recovery&code=abc');

    render(<SanitizeRecoveryUrl />);

    expect(mockReplace).toHaveBeenCalledWith('/forgot-password');
  });

  it('jamais le détail brut Supabase dans la cible de nettoyage', () => {
    mockSearchParams = new URLSearchParams('error_description=Email+link+is+invalid+or+has+expired&reason=link_expired');

    render(<SanitizeRecoveryUrl />);

    const target = mockReplace.mock.calls[0]?.[0] as string;
    expect(target).not.toContain('error_description');
    expect(target).not.toContain('invalid');
  });
});

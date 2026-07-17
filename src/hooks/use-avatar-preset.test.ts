import { act, renderHook } from '@testing-library/react-native';

import { useAvatarPreset } from '@/hooks/use-avatar-preset';
import { updateMyAvatarPreset } from '@/services/profiles';
import type { MyProfile } from '@/services/profiles';

jest.mock('@/services/profiles', () => ({
  updateMyAvatarPreset: jest.fn(),
}));

const baseProfile: MyProfile = {
  id: 'me',
  username: 'kenjiro47',
  displayName: 'Kenjiro',
  avatarUrl: null,
  avatarPath: null,
  avatarPreset: 'wolf_white_calm',
  role: 'user',
};

// Voir la même note dans use-profile-editor.test.ts : un act() async avec un
// tick est nécessaire pour que result.current reflète l'état après l'effet.
async function run(fn: () => unknown) {
  await act(async () => {
    await fn();
    await Promise.resolve();
  });
}

describe('useAvatarPreset', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("initialise la sélection sur l'avatar actuel du profil", async () => {
    const { result } = await renderHook(() => useAvatarPreset(baseProfile, jest.fn()));

    expect(result.current.selected).toBe('wolf_white_calm');
    expect(result.current.isDirty).toBe(false);
  });

  it('select() marque isDirty=true dès que la sélection diffère de avatar_preset actuel', async () => {
    const { result } = await renderHook(() => useAvatarPreset(baseProfile, jest.fn()));

    await run(() => result.current.select('wolf_grey'));

    expect(result.current.selected).toBe('wolf_grey');
    expect(result.current.isDirty).toBe(true);
  });

  it("isDirty=false si l'utilisateur reclique sur l'avatar déjà actuel", async () => {
    const { result } = await renderHook(() => useAvatarPreset(baseProfile, jest.fn()));

    await run(() => result.current.select('wolf_grey'));
    await run(() => result.current.select('wolf_white_calm'));

    expect(result.current.isDirty).toBe(false);
  });

  it("reset() revient à l'avatar déjà enregistré sans appeler la RPC", async () => {
    const { result } = await renderHook(() => useAvatarPreset(baseProfile, jest.fn()));

    await run(() => result.current.select('wolf_alpha'));
    await run(() => result.current.reset());

    expect(result.current.selected).toBe('wolf_white_calm');
    expect(result.current.isDirty).toBe(false);
    expect(updateMyAvatarPreset).not.toHaveBeenCalled();
  });

  it("save() ne fait rien tant qu'aucune sélection n'a changé", async () => {
    const { result } = await renderHook(() => useAvatarPreset(baseProfile, jest.fn()));

    let saved = true;
    await run(async () => {
      saved = await result.current.save();
    });

    expect(saved).toBe(false);
    expect(updateMyAvatarPreset).not.toHaveBeenCalled();
  });

  it('save() réussi : appelle la RPC, montre le succès, et appelle onSaved avec le nouvel avatar', async () => {
    (updateMyAvatarPreset as jest.Mock).mockResolvedValue('wolf_grey');
    const onSaved = jest.fn();
    const { result } = await renderHook(() => useAvatarPreset(baseProfile, onSaved));

    await run(() => result.current.select('wolf_grey'));
    let saved = false;
    await run(async () => {
      saved = await result.current.save();
    });

    expect(saved).toBe(true);
    expect(updateMyAvatarPreset).toHaveBeenCalledWith('wolf_grey');
    expect(result.current.success).toBe(true);
    expect(onSaved).toHaveBeenCalledWith({ ...baseProfile, avatarPreset: 'wolf_grey' });
  });

  it("save() échoué : affiche l'erreur française, n'appelle jamais onSaved (ancien avatar conservé ailleurs dans l'app)", async () => {
    (updateMyAvatarPreset as jest.Mock).mockRejectedValue(new Error('Avatar invalide.'));
    const onSaved = jest.fn();
    const { result } = await renderHook(() => useAvatarPreset(baseProfile, onSaved));

    await run(() => result.current.select('wolf_grey'));
    let saved = true;
    await run(async () => {
      saved = await result.current.save();
    });

    expect(saved).toBe(false);
    expect(result.current.error).toBe('Avatar invalide.');
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('bloque le double-clic : un second save() pendant que le premier est en cours ne relance pas la RPC', async () => {
    let resolveUpdate: (value: string) => void = () => {};
    (updateMyAvatarPreset as jest.Mock).mockReturnValue(
      new Promise((resolve) => {
        resolveUpdate = resolve;
      }),
    );
    const onSaved = jest.fn();
    const { result } = await renderHook(() => useAvatarPreset(baseProfile, onSaved));

    await run(() => result.current.select('wolf_grey'));

    let firstCallPromise: Promise<boolean> = Promise.resolve(false);
    await run(async () => {
      firstCallPromise = result.current.save();
      const second = await result.current.save();
      expect(second).toBe(false);
    });

    expect(updateMyAvatarPreset).toHaveBeenCalledTimes(1);

    await run(async () => {
      resolveUpdate('wolf_grey');
      await firstCallPromise;
    });
  });
});

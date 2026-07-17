import { logDebugEvent } from '@/lib/logger';

function setDev(value: boolean): void {
  (globalThis as unknown as { __DEV__: boolean }).__DEV__ = value;
}

describe('logDebugEvent', () => {
  const originalDev = __DEV__;
  let consoleLogSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    setDev(originalDev);
    consoleLogSpy.mockRestore();
  });

  it('journalise en développement (__DEV__ = true)', () => {
    setDev(true);

    logDebugEvent('Message de test');

    expect(consoleLogSpy).toHaveBeenCalledTimes(1);
    expect(consoleLogSpy).toHaveBeenCalledWith('Message de test');
  });

  it("ne journalise jamais en Release (__DEV__ = false) : aucun console.log n'atteint logcat", () => {
    setDev(false);

    logDebugEvent('Message qui ne doit jamais apparaître en Release');

    expect(consoleLogSpy).not.toHaveBeenCalled();
  });
});

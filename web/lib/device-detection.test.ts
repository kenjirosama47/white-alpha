import {
  detectPlatform,
  isChromeOnIOS,
  isInAppBrowser,
  isSafari,
  isStandaloneDisplay,
} from './device-detection';

const ANDROID_CHROME_UA =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36';
const IPHONE_SAFARI_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/604.1';
const IPHONE_CHROME_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/125.0.0.0 Mobile/15E148 Safari/604.1';
const IPAD_CLASSIC_UA =
  'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/604.1';
const IPAD_DESKTOP_CLASS_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15';
const REAL_MAC_UA = IPAD_DESKTOP_CLASS_UA;
const DESKTOP_CHROME_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';
const INSTAGRAM_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 302.0.0.0';

describe('detectPlatform', () => {
  it('détecte Android', () => {
    expect(detectPlatform(ANDROID_CHROME_UA)).toBe('android');
  });

  it('détecte iPhone', () => {
    expect(detectPlatform(IPHONE_SAFARI_UA)).toBe('ios');
  });

  it('détecte iPad classique (user-agent "iPad" explicite)', () => {
    expect(detectPlatform(IPAD_CLASSIC_UA)).toBe('ios');
  });

  it('détecte iPad iPadOS 13+ (user-agent "Macintosh" + écran tactile) via maxTouchPoints', () => {
    expect(detectPlatform(IPAD_DESKTOP_CLASS_UA, 5)).toBe('ios');
  });

  it('ne classe jamais un vrai Mac (sans point tactile) comme iOS', () => {
    expect(detectPlatform(REAL_MAC_UA, 0)).toBe('other');
  });

  it('détecte "other" pour un ordinateur de bureau classique', () => {
    expect(detectPlatform(DESKTOP_CHROME_UA)).toBe('other');
  });
});

describe('isStandaloneDisplay', () => {
  it('true si display-mode: standalone correspond', () => {
    expect(isStandaloneDisplay(true, false)).toBe(true);
  });

  it('true si navigator.standalone (Safari iOS) est vrai', () => {
    expect(isStandaloneDisplay(false, true)).toBe(true);
  });

  it('false si aucun des deux signaux', () => {
    expect(isStandaloneDisplay(false, false)).toBe(false);
  });
});

describe('isSafari', () => {
  it('reconnaît Safari iOS réel', () => {
    expect(isSafari(IPHONE_SAFARI_UA)).toBe(true);
  });

  it('rejette Chrome iOS (CriOS) malgré la présence du token "Safari" dans son UA', () => {
    expect(isSafari(IPHONE_CHROME_UA)).toBe(false);
  });

  it('rejette Chrome Android (contient aussi "Safari")', () => {
    expect(isSafari(ANDROID_CHROME_UA)).toBe(false);
  });
});

describe('isChromeOnIOS', () => {
  it('détecte CriOS', () => {
    expect(isChromeOnIOS(IPHONE_CHROME_UA)).toBe(true);
  });

  it('ne détecte pas Safari réel', () => {
    expect(isChromeOnIOS(IPHONE_SAFARI_UA)).toBe(false);
  });
});

describe('isInAppBrowser', () => {
  it('détecte le navigateur intégré Instagram', () => {
    expect(isInAppBrowser(INSTAGRAM_UA)).toBe(true);
  });

  it('ne déclenche jamais pour Safari réel', () => {
    expect(isInAppBrowser(IPHONE_SAFARI_UA)).toBe(false);
  });
});

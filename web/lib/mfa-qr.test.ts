import { buildQrCodeDataUri } from './mfa-qr';

describe('buildQrCodeDataUri', () => {
  it('convertit un SVG brut (format réel renvoyé par supabase.auth.mfa.enroll) en data URI base64 valide', () => {
    const rawSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect/></svg>';

    const result = buildQrCodeDataUri(rawSvg);

    expect(result).toMatch(/^data:image\/svg\+xml;base64,[A-Za-z0-9+/=]+$/);
    const decoded = Buffer.from(result.split(',')[1] ?? '', 'base64').toString('utf-8');
    expect(decoded).toBe(rawSvg);
  });

  it('jamais le format `;utf-8,` (paramètre non standard RFC 2397, cause du bug de rendu en production)', () => {
    const result = buildQrCodeDataUri('<svg/>');

    expect(result).not.toContain(';utf-8,');
    expect(result).not.toContain('%3Csvg');
  });

  it('valeur déjà une data URI : passthrough sans double encodage', () => {
    const alreadyDataUri = 'data:image/svg+xml;base64,PHN2Zy8+';

    expect(buildQrCodeDataUri(alreadyDataUri)).toBe(alreadyDataUri);
  });

  it('conserve fidèlement les caractères spéciaux XML (guillemets, chevrons, dièse) sans corruption', () => {
    const rawSvg = '<svg id="a#b" data-x="<>&"><path d="M0 0"/></svg>';

    const result = buildQrCodeDataUri(rawSvg);
    const decoded = Buffer.from(result.split(',')[1] ?? '', 'base64').toString('utf-8');

    expect(decoded).toBe(rawSvg);
  });
});

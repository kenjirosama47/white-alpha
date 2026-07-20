import { MAX_IMAGE_SIZE_BYTES, MAX_VIDEO_SIZE_BYTES, MEDIA_HEADER_BYTES_REQUIRED } from './media-config';
import { validateMediaFileOnServer, type ServerMediaFileInput } from './media-server-validation';

function bytes(values: number[]): Uint8Array {
  return new Uint8Array(values);
}

/** En-têtes valides (16 octets, signature réelle suivie d'un remplissage neutre) pour chaque type autorisé. */
const VALID_HEADERS: Record<string, Uint8Array> = {
  'image/jpeg': bytes([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
  'image/png': bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0, 0, 0, 0, 0]),
  'image/webp': bytes([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0, 0, 0, 0]),
  'video/mp4': bytes([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0, 0, 0, 0]),
  'video/webm': bytes([0x1a, 0x45, 0xdf, 0xa3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
};

const VALID_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
};

function validInput(mimeType: string, overrides: Partial<ServerMediaFileInput> = {}): ServerMediaFileInput {
  return {
    declaredMimeType: mimeType,
    originalFilename: `fichier.${VALID_EXTENSIONS[mimeType]}`,
    sizeBytes: 1024,
    header: VALID_HEADERS[mimeType]!,
    ...overrides,
  };
}

describe('validateMediaFileOnServer — fichiers valides', () => {
  it('accepte un JPEG valide', () => {
    const result = validateMediaFileOnServer(validInput('image/jpeg'));
    expect(result).toEqual({ ok: true, mediaType: 'image', mimeType: 'image/jpeg' });
  });

  it('accepte un PNG valide', () => {
    const result = validateMediaFileOnServer(validInput('image/png'));
    expect(result).toEqual({ ok: true, mediaType: 'image', mimeType: 'image/png' });
  });

  it('accepte un WebP valide', () => {
    const result = validateMediaFileOnServer(validInput('image/webp'));
    expect(result).toEqual({ ok: true, mediaType: 'image', mimeType: 'image/webp' });
  });

  it('accepte un MP4 valide', () => {
    const result = validateMediaFileOnServer(validInput('video/mp4'));
    expect(result).toEqual({ ok: true, mediaType: 'video', mimeType: 'video/mp4' });
  });

  it('accepte un WebM valide', () => {
    const result = validateMediaFileOnServer(validInput('video/webm'));
    expect(result).toEqual({ ok: true, mediaType: 'video', mimeType: 'video/webm' });
  });
});

describe('validateMediaFileOnServer — fichiers invalides', () => {
  it('refuse un fichier vide (taille 0)', () => {
    const result = validateMediaFileOnServer(validInput('image/png', { sizeBytes: 0 }));
    expect(result).toEqual({ ok: false, code: 'empty_or_corrupt', error: expect.any(String) });
  });

  it('refuse un fichier trop court pour contenir une signature (corrompu/tronqué)', () => {
    const result = validateMediaFileOnServer(
      validInput('image/png', { sizeBytes: 5, header: bytes([0x89, 0x50, 0x4e, 0x47, 0x0d]) }),
    );
    expect(result).toEqual({ ok: false, code: 'empty_or_corrupt', error: expect.any(String) });
  });

  it('refuse une image dépassant 10 Mo', () => {
    const result = validateMediaFileOnServer(validInput('image/jpeg', { sizeBytes: MAX_IMAGE_SIZE_BYTES + 1 }));
    expect(result).toEqual({ ok: false, code: 'file_too_large', error: expect.any(String) });
  });

  it('refuse une vidéo dépassant 50 Mo', () => {
    const result = validateMediaFileOnServer(validInput('video/mp4', { sizeBytes: MAX_VIDEO_SIZE_BYTES + 1 }));
    expect(result).toEqual({ ok: false, code: 'file_too_large', error: expect.any(String) });
  });

  it('refuse un faux PNG contenant du texte (signature ne correspond pas au MIME déclaré)', () => {
    // Octets ASCII d'un texte quelconque — construits manuellement plutôt
    // qu'avec TextEncoder, indisponible dans cet environnement de test.
    // `padEnd` garantit au moins MEDIA_HEADER_BYTES_REQUIRED caractères,
    // jamais une comptée manuelle fragile.
    const textHeader = bytes(
      'Ceci nest pas une image PNG'
        .padEnd(MEDIA_HEADER_BYTES_REQUIRED, '!')
        .slice(0, MEDIA_HEADER_BYTES_REQUIRED)
        .split('')
        .map((char) => char.charCodeAt(0)),
    );
    const result = validateMediaFileOnServer(validInput('image/png', { header: textHeader }));
    expect(result).toEqual({ ok: false, code: 'content_mismatch', error: expect.any(String) });
  });

  it('refuse un faux MP4 (déclaré video/mp4, signature ftyp absente)', () => {
    const fakeHeader = bytes([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);
    const result = validateMediaFileOnServer(validInput('video/mp4', { header: fakeHeader }));
    expect(result).toEqual({ ok: false, code: 'content_mismatch', error: expect.any(String) });
  });

  it('refuse un contenu JPEG réel déclaré comme PNG (incohérence déclaration/contenu)', () => {
    const result = validateMediaFileOnServer(
      validInput('image/png', { header: VALID_HEADERS['image/jpeg'], originalFilename: 'photo.png' }),
    );
    expect(result).toEqual({ ok: false, code: 'content_mismatch', error: expect.any(String) });
  });

  it('refuse une extension .jpg.exe (double extension suspecte, extension finale non autorisée)', () => {
    const result = validateMediaFileOnServer(validInput('image/jpeg', { originalFilename: 'photo.jpg.exe' }));
    expect(result).toEqual({ ok: false, code: 'type_not_allowed', error: expect.any(String) });
  });

  it('refuse un SVG (type MIME hors liste blanche)', () => {
    const result = validateMediaFileOnServer(
      validInput('image/svg+xml' as never, {
        originalFilename: 'image.svg',
        header: bytes([0x3c, 0x73, 0x76, 0x67, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
      }),
    );
    expect(result).toEqual({ ok: false, code: 'type_not_allowed', error: expect.any(String) });
  });

  it('refuse un HTML (type MIME hors liste blanche)', () => {
    const result = validateMediaFileOnServer(
      validInput('text/html' as never, {
        originalFilename: 'page.html',
        header: bytes([0x3c, 0x68, 0x74, 0x6d, 0x6c, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
      }),
    );
    expect(result).toEqual({ ok: false, code: 'type_not_allowed', error: expect.any(String) });
  });

  it('refuse un GIF (non prévu dans la liste blanche)', () => {
    const result = validateMediaFileOnServer(
      validInput('image/gif' as never, {
        originalFilename: 'animation.gif',
        header: bytes([0x47, 0x49, 0x46, 0x38, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
      }),
    );
    expect(result).toEqual({ ok: false, code: 'type_not_allowed', error: expect.any(String) });
  });

  it('refuse un PDF (type MIME hors liste blanche)', () => {
    const result = validateMediaFileOnServer(validInput('application/pdf' as never, { originalFilename: 'document.pdf' }));
    expect(result).toEqual({ ok: false, code: 'type_not_allowed', error: expect.any(String) });
  });

  it('refuse une archive ZIP (type MIME hors liste blanche)', () => {
    const result = validateMediaFileOnServer(validInput('application/zip' as never, { originalFilename: 'archive.zip' }));
    expect(result).toEqual({ ok: false, code: 'type_not_allowed', error: expect.any(String) });
  });

  it('refuse un script (type MIME hors liste blanche)', () => {
    const result = validateMediaFileOnServer(validInput('application/javascript' as never, { originalFilename: 'script.js' }));
    expect(result).toEqual({ ok: false, code: 'type_not_allowed', error: expect.any(String) });
  });

  it('refuse un exécutable (type MIME hors liste blanche)', () => {
    const result = validateMediaFileOnServer(validInput('application/x-msdownload' as never, { originalFilename: 'installateur.exe' }));
    expect(result).toEqual({ ok: false, code: 'type_not_allowed', error: expect.any(String) });
  });

  it('refuse un nom contenant une traversée de chemin (../)', () => {
    const result = validateMediaFileOnServer(validInput('image/jpeg', { originalFilename: '../../etc/passwd.jpg' }));
    expect(result).toEqual({ ok: false, code: 'unsafe_filename', error: expect.any(String) });
  });

  it('refuse un nom contenant un séparateur de répertoire', () => {
    const result = validateMediaFileOnServer(validInput('image/jpeg', { originalFilename: 'dossier/photo.jpg' }));
    expect(result).toEqual({ ok: false, code: 'unsafe_filename', error: expect.any(String) });
    const resultBackslash = validateMediaFileOnServer(validInput('image/jpeg', { originalFilename: 'dossier\\photo.jpg' }));
    expect(resultBackslash).toEqual({ ok: false, code: 'unsafe_filename', error: expect.any(String) });
  });

  it('refuse un nom contenant un caractère de contrôle (octet nul)', () => {
    // Construit dynamiquement (jamais un littéral échappé dans le code
    // source) : le caractère de contrôle est assemblé à l'exécution pour
    // éviter toute ambiguïté d'encodage dans ce fichier source.
    const nullCharacter = String.fromCharCode(0);
    const unsafeName = `photo${nullCharacter}.jpg`;
    const result = validateMediaFileOnServer(validInput('image/jpeg', { originalFilename: unsafeName }));
    expect(result).toEqual({ ok: false, code: 'unsafe_filename', error: expect.any(String) });
  });

  it('refuse un nom sans extension', () => {
    const result = validateMediaFileOnServer(validInput('image/jpeg', { originalFilename: 'photo' }));
    expect(result).toEqual({ ok: false, code: 'type_not_allowed', error: expect.any(String) });
  });

  it('refuse un type MIME déclaré absent (null)', () => {
    const result = validateMediaFileOnServer(validInput('image/jpeg', { declaredMimeType: null }));
    expect(result).toEqual({ ok: false, code: 'type_not_allowed', error: expect.any(String) });
  });
});

describe('validateMediaFileOnServer — noms Unicode/longs et absence d’effet sur le résultat', () => {
  it('accepte un nom Unicode sans effet sur le verdict', () => {
    const result = validateMediaFileOnServer(validInput('image/jpeg', { originalFilename: '📷_été_vacances_écran.jpg' }));
    expect(result).toEqual({ ok: true, mediaType: 'image', mimeType: 'image/jpeg' });
  });

  it('accepte un nom très long sans effet sur le verdict', () => {
    const longName = `${'a'.repeat(500)}.jpg`;
    const result = validateMediaFileOnServer(validInput('image/jpeg', { originalFilename: longName }));
    expect(result).toEqual({ ok: true, mediaType: 'image', mimeType: 'image/jpeg' });
  });

  it('ne renvoie jamais le nom de fichier original dans le résultat (succès ou échec)', () => {
    const distinctiveName = 'NOM_TRES_DISTINCTIF_A_NE_JAMAIS_RETROUVER.jpg';
    const success = validateMediaFileOnServer(validInput('image/jpeg', { originalFilename: distinctiveName }));
    expect(JSON.stringify(success)).not.toContain('NOM_TRES_DISTINCTIF');

    const failure = validateMediaFileOnServer(validInput('image/jpeg', { originalFilename: '../NOM_TRES_DISTINCTIF.jpg' }));
    expect(JSON.stringify(failure)).not.toContain('NOM_TRES_DISTINCTIF');
  });
});

describe('validateMediaFileOnServer — pas de lecture complète en mémoire', () => {
  it("ne lit jamais au-delà des MEDIA_HEADER_BYTES_REQUIRED premiers octets de l'en-tête", () => {
    // Un en-tête plus long que nécessaire, dont la signature est correcte
    // dans les MEDIA_HEADER_BYTES_REQUIRED premiers octets mais corrompue
    // au-delà : si la fonction ne lit bien que le préfixe requis (jamais la
    // vidéo entière), le résultat reste un succès malgré la corruption
    // tardive.
    const oversizedHeader = new Uint8Array(1024);
    oversizedHeader.set(VALID_HEADERS['video/mp4']!, 0);
    for (let i = MEDIA_HEADER_BYTES_REQUIRED; i < oversizedHeader.length; i += 1) {
      oversizedHeader[i] = 0xff; // octets "corrompus" au-delà du préfixe requis
    }

    const result = validateMediaFileOnServer(
      validInput('video/mp4', { header: oversizedHeader, sizeBytes: MAX_VIDEO_SIZE_BYTES }),
    );
    expect(result).toEqual({ ok: true, mediaType: 'video', mimeType: 'video/mp4' });
  });

  it('accepte une taille déclarée de 50 Mo sans exiger un en-tête de cette taille (seul un petit en-tête est nécessaire)', () => {
    // Preuve par construction : l'entrée ne fournit qu'un en-tête de 16
    // octets pour un fichier prétendu de 50 Mo — si la fonction exigeait le
    // contenu complet, ce test échouerait par conception (aucun buffer de
    // 50 Mo n'est jamais alloué ici).
    const result = validateMediaFileOnServer(validInput('video/webm', { sizeBytes: MAX_VIDEO_SIZE_BYTES }));
    expect(result).toEqual({ ok: true, mediaType: 'video', mimeType: 'video/webm' });
    expect(VALID_HEADERS['video/webm']!.length).toBe(MEDIA_HEADER_BYTES_REQUIRED);
  });
});

describe('validateMediaFileOnServer — erreurs génériques', () => {
  it('ne lève jamais d’exception et renvoie une erreur générique non sensible sur une entrée inattendue', () => {
    const result = validateMediaFileOnServer({
      declaredMimeType: 'image/jpeg',
      originalFilename: 'photo.jpg',
      sizeBytes: Number.NaN,
      header: VALID_HEADERS['image/jpeg']!,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('empty_or_corrupt');
      expect(result.error.toLowerCase()).not.toContain('nan');
      expect(result.error.toLowerCase()).not.toContain('undefined');
    }
  });
});

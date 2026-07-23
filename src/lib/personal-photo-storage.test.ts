import { Directory, File } from 'expo-file-system';

import { deletePersonalPhotoFile, personalPhotoFileExists, savePersonalPhotoFile } from '@/lib/personal-photo-storage';

type MockFileInstance = {
  uri: string;
  exists: boolean;
  copy: jest.Mock;
  delete: jest.Mock;
};

/**
 * Simule `File`/`Directory` d'`expo-file-system` : chaque instance créée via
 * `new File(...)`/`new Directory(...)` est trackée par Jest
 * (`mock.instances`), avec un comportement par défaut réaliste (le fichier
 * "existe" tant qu'un test ne dit pas explicitement le contraire).
 */
jest.mock('expo-file-system', () => {
  const FileMock = jest.fn().mockImplementation(function (this: MockFileInstance, ...args: unknown[]) {
    const last = args[args.length - 1];
    this.uri = typeof last === 'string' ? last : `file:///mock/private/${String(last)}`;
    this.exists = true;
    this.copy = jest.fn().mockResolvedValue(undefined);
    this.delete = jest.fn();
  });
  const DirectoryMock = jest.fn().mockImplementation(function (this: { uri: string; exists: boolean; create: jest.Mock }) {
    this.uri = 'file:///mock/private/appearance-photos';
    this.exists = false;
    this.create = jest.fn();
  });
  return {
    Paths: { document: 'file:///mock/private/' },
    File: FileMock,
    Directory: DirectoryMock,
  };
});

const FileCtor = File as unknown as jest.Mock;
const DirectoryCtor = Directory as unknown as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('savePersonalPhotoFile', () => {
  it('crée le dossier privé de façon idempotente puis copie le fichier temporaire vers ce dossier', async () => {
    const finalUri = await savePersonalPhotoFile('file:///cache/ImageManipulator/tmp123.jpg');

    expect(DirectoryCtor).toHaveBeenCalledWith('file:///mock/private/', 'appearance-photos');
    const directoryInstance = DirectoryCtor.mock.instances[0] as unknown as { create: jest.Mock };
    expect(directoryInstance.create).toHaveBeenCalledWith({ intermediates: true, idempotent: true });

    // Le nom final n'est jamais dérivé du fichier source (uuid généré).
    expect(finalUri).toMatch(/[0-9a-f-]{36}\.jpg$/);
  });

  it("génère un nom de fichier différent à chaque appel (jamais dérivé du fichier source)", async () => {
    const uriA = await savePersonalPhotoFile('file:///cache/a.jpg');
    const uriB = await savePersonalPhotoFile('file:///cache/b.jpg');

    expect(uriA).not.toBe(uriB);
  });

  it('copie le fichier temporaire vers le stockage privé puis supprime le temporaire (aucun fichier source temporaire conservé)', async () => {
    await savePersonalPhotoFile('file:///cache/ImageManipulator/tmp123.jpg');

    const [destinationInstance, sourceInstance] = FileCtor.mock.instances as unknown as MockFileInstance[];
    expect(sourceInstance.copy).toHaveBeenCalledWith(destinationInstance, { overwrite: true });
    expect(sourceInstance.delete).toHaveBeenCalledTimes(1);
  });

  it('ne plante pas si la suppression du fichier temporaire échoue (best-effort)', async () => {
    FileCtor.mockImplementationOnce(function (this: MockFileInstance) {
      this.uri = 'file:///mock/private/appearance-photos/generated.jpg';
      this.exists = true;
      this.copy = jest.fn().mockResolvedValue(undefined);
      this.delete = jest.fn();
    }).mockImplementationOnce(function (this: MockFileInstance) {
      this.uri = 'file:///cache/tmp.jpg';
      this.exists = true;
      this.copy = jest.fn().mockResolvedValue(undefined);
      this.delete = jest.fn(() => {
        throw new Error('suppression impossible');
      });
    });

    await expect(savePersonalPhotoFile('file:///cache/tmp.jpg')).resolves.toEqual(expect.any(String));
  });
});

describe('personalPhotoFileExists', () => {
  it('renvoie true quand le fichier existe', () => {
    expect(personalPhotoFileExists('file:///mock/private/appearance-photos/present.jpg')).toBe(true);
  });

  it('renvoie false quand le fichier est absent (fichier local manquant)', () => {
    FileCtor.mockImplementationOnce(function (this: MockFileInstance) {
      this.uri = 'file:///mock/private/appearance-photos/absent.jpg';
      this.exists = false;
      this.copy = jest.fn();
      this.delete = jest.fn();
    });

    expect(personalPhotoFileExists('file:///mock/private/appearance-photos/absent.jpg')).toBe(false);
  });

  it("renvoie false plutôt que de lever une erreur pour une URI invalide", () => {
    FileCtor.mockImplementationOnce(() => {
      throw new Error('URI invalide');
    });

    expect(personalPhotoFileExists('n’importe-quoi')).toBe(false);
  });
});

describe('deletePersonalPhotoFile', () => {
  it('supprime le fichier référencé quand il existe', async () => {
    await deletePersonalPhotoFile('file:///mock/private/appearance-photos/present.jpg');

    const instance = FileCtor.mock.instances[0] as unknown as MockFileInstance;
    expect(instance.delete).toHaveBeenCalledTimes(1);
  });

  it("n'appelle jamais delete si le fichier n'existe déjà plus (idempotent)", async () => {
    FileCtor.mockImplementationOnce(function (this: MockFileInstance) {
      this.uri = 'file:///mock/private/appearance-photos/absent.jpg';
      this.exists = false;
      this.copy = jest.fn();
      this.delete = jest.fn();
    });

    await deletePersonalPhotoFile('file:///mock/private/appearance-photos/absent.jpg');

    const instance = FileCtor.mock.instances[0] as unknown as MockFileInstance;
    expect(instance.delete).not.toHaveBeenCalled();
  });

  it('ne lève jamais d’erreur même si la suppression échoue (best-effort)', async () => {
    FileCtor.mockImplementationOnce(function (this: MockFileInstance) {
      this.uri = 'file:///mock/private/appearance-photos/present.jpg';
      this.exists = true;
      this.copy = jest.fn();
      this.delete = jest.fn(() => {
        throw new Error('suppression impossible');
      });
    });

    await expect(deletePersonalPhotoFile('file:///mock/private/appearance-photos/present.jpg')).resolves.toBeUndefined();
  });
});

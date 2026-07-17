const fs = require('node:fs');
const path = require('node:path');

const { findMissingAvatarPresets } = require('./avatar-assets-guard');

const OFFICIAL_IDS = [
  'wolf_white_calm',
  'wolf_grey',
  'wolf_black',
  'wolf_brown',
  'wolf_snow',
  'wolf_green_eye',
  'wolf_young',
  'wolf_guardian',
  'wolf_alpha',
];

function catalogFixture(sourcesBlock) {
  const catalogEntries = OFFICIAL_IDS.map((id) => `  { id: '${id}', label: 'Test' },`).join('\n');
  return `
export const WOLF_AVATAR_CATALOG = [
${catalogEntries}
] as const;

const WOLF_AVATAR_SOURCES = {
${sourcesBlock}
};
`;
}

describe('findMissingAvatarPresets', () => {
  it('signale les 9 identifiants comme manquants quand WOLF_AVATAR_SOURCES est vide', () => {
    const fixture = catalogFixture('  // aucune entrée active\n');
    expect(findMissingAvatarPresets(fixture)).toEqual(OFFICIAL_IDS);
  });

  it("ignore une entrée commentée (n'est jamais considérée comme présente)", () => {
    const fixture = catalogFixture("  // wolf_white_calm: require('../../assets/images/avatars/wolf_white_calm.png'),\n");
    expect(findMissingAvatarPresets(fixture)).toEqual(OFFICIAL_IDS);
  });

  it('ne signale plus un identifiant dont la ligne require est active (non commentée)', () => {
    const fixture = catalogFixture(
      "  wolf_white_calm: require('../../assets/images/avatars/wolf_white_calm.png'),\n",
    );
    expect(findMissingAvatarPresets(fixture)).toEqual(OFFICIAL_IDS.filter((id) => id !== 'wolf_white_calm'));
  });

  it('ne signale plus aucun identifiant quand les 9 lignes require sont actives', () => {
    const sourcesBlock = OFFICIAL_IDS.map(
      (id) => `  ${id}: require('../../assets/images/avatars/${id}.png'),`,
    ).join('\n');
    const fixture = catalogFixture(sourcesBlock + '\n');
    expect(findMissingAvatarPresets(fixture)).toEqual([]);
  });

  it("l'état RÉEL actuel du dépôt (Phase 7.5 complète) ne signale plus aucun avatar manquant — les 9 sont actifs", () => {
    const realFileContent = fs.readFileSync(
      path.resolve(__dirname, '../src/constants/avatars.ts'),
      'utf8',
    );
    expect(findMissingAvatarPresets(realFileContent)).toEqual([]);
  });
});

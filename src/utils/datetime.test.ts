import { formatDateSeparator, formatTime, isSameLocalDay } from '@/utils/datetime';

describe('formatTime', () => {
  it('formate un horodatage ISO en heure locale courte', () => {
    expect(formatTime('2026-07-16T10:05:00Z')).toMatch(/\d{1,2}:\d{2}/);
  });
});

describe('isSameLocalDay', () => {
  it('true pour deux horodatages du même jour', () => {
    expect(isSameLocalDay('2026-07-16T08:00:00Z', '2026-07-16T20:00:00Z')).toBe(true);
  });

  it('false pour deux jours différents', () => {
    expect(isSameLocalDay('2026-07-16T08:00:00Z', '2026-07-17T08:00:00Z')).toBe(false);
  });
});

describe('formatDateSeparator', () => {
  it("affiche « Aujourd'hui » pour un horodatage du jour même", () => {
    const now = new Date();
    expect(formatDateSeparator(now.toISOString())).toBe("Aujourd'hui");
  });

  it('affiche « Hier » pour un horodatage de la veille', () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    expect(formatDateSeparator(yesterday.toISOString())).toBe('Hier');
  });

  it('affiche une date complète pour un horodatage plus ancien', () => {
    expect(formatDateSeparator('2020-01-15T10:00:00Z')).not.toBe("Aujourd'hui");
    expect(formatDateSeparator('2020-01-15T10:00:00Z')).not.toBe('Hier');
    expect(formatDateSeparator('2020-01-15T10:00:00Z')).toMatch(/2020/);
  });
});

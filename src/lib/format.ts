export const formatPriceINR = (paise: number) => {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(paise);
};

export const slugify = (s: string) =>
  s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

// Level curve: level n requires n*100 cumulative XP into that level
export const xpForLevel = (level: number) => level * 100;
export const levelFromXP = (xp: number) => {
  let lvl = 1;
  let remaining = xp;
  while (remaining >= xpForLevel(lvl)) {
    remaining -= xpForLevel(lvl);
    lvl++;
  }
  return { level: lvl, xpIntoLevel: remaining, xpToNext: xpForLevel(lvl) };
};

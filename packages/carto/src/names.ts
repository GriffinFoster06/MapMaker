// Place names for the labels (Phase 5c). Original code: a small syllable grammar, seeded by the world and the feature, so the
// same world names the same places the same way on every machine and at every resolution (the key is the feature's kind and
// its anchor rounded to 3°, not a cell index). These are placeholders for a real naming system (languages and cultures,
// Phase 18); a user renames features by overriding the label text in the style, not in the World.
import { Alea } from '@mapmaker/core';
import type { LabelKind } from './style';

const ONSETS = ['b', 'br', 'c', 'cal', 'd', 'dr', 'el', 'f', 'g', 'gr', 'h', 'k', 'kr', 'l', 'm', 'mor', 'n', 'p', 'r', 's', 'sh', 'st', 't', 'th', 'tr', 'v', 'val', 'z'];
const VOWELS = ['a', 'e', 'i', 'o', 'u', 'a', 'e', 'o', 'a', 'e', 'ai', 'ou'];
const CODAS = ['', '', '', 'n', 'r', 'l', 's', 'th', 'nd', 'rn', 'ld', 'k', 'm'];
// Endings per kind: after a root that ends in a consonant, one that starts with a vowel; after one that ends in a vowel,
// one that starts with a consonant (so no "aa" or "oua" seams).
const AFTER_CONSONANT: Record<LabelKind, string[]> = {
  continent: ['ia', 'a', 'ara', 'ea', 'os', 'ar', 'and', 'ica'],
  island: ['a', 'ey', 'is', 'o', 'an', 'ar', 'i'],
  ocean: ['an', 'ic', 'ean', 'a', 'on'],
  sea: ['a', 'ar', 'is', 'en', 'o'],
  range: ['ar', 'or', 'ak', 'an', 'ond', 'as'],
  river: ['a', 'en', 'is', 'ar', 'ow', 'in'],
};
const AFTER_VOWEL: Record<LabelKind, string[]> = {
  continent: ['ria', 'nia', 'ra', 'lia', 'ndar', 'nor', 'ssa'],
  island: ['ra', 'na', 'th', 'n', 'ley', 'ssa'],
  ocean: ['ric', 'nic', 'ran', 'lan', 'than'],
  sea: ['ra', 'na', 'ren', 'lis', 'th'],
  range: ['rak', 'nor', 'ndor', 'th', 'ran'],
  river: ['ra', 'na', 'ren', 'lis', 'th', 'ndow'],
};
const WORD: Record<LabelKind, string> = { continent: '', island: '', ocean: ' Ocean', sea: ' Sea', range: ' Mountains', river: ' River' };

const pick = <T>(a: readonly T[], r: () => number): T => a[Math.min(a.length - 1, Math.floor(r() * a.length))]!;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const isVowel = (c: string) => 'aeiou'.includes(c);

/** One name for `kind`, drawn from `rng`: a root of one or two syllables and an ending, 4 to 9 letters. */
function draw(kind: LabelKind, rng: () => number): string {
  for (let attempt = 0; ; attempt++) {
    const syllables = 1 + Math.floor(rng() * 1.9); // 1 or 2
    let root = '';
    for (let i = 0; i < syllables; i++) root += pick(ONSETS, rng) + pick(VOWELS, rng) + (i < syllables - 1 ? pick(CODAS, rng) : '');
    const ends = isVowel(root.charAt(root.length - 1)) ? AFTER_VOWEL[kind] : AFTER_CONSONANT[kind];
    const name = root + pick(ends, rng);
    if ((name.length >= 4 && name.length <= 9 && !/([aeiou])\1/.test(name)) || attempt > 40) return cap(name) + WORD[kind];
  }
}

/**
 * Names for the features of a world. `key(f)` identifies a feature by kind and rounded position; features are named in the
 * order given, and a name already taken gets another draw from the same stream, so the result depends only on the seed, the
 * features and their order.
 */
export function nameFeatures(seed: string, features: { kind: LabelKind; lon: number; lat: number }[]): string[] {
  const taken = new Set<string>();
  return features.map((f) => {
    const rng = new Alea('name', `${seed}|${f.kind}|${Math.round(f.lon / 3)}|${Math.round(f.lat / 3)}`);
    const next = () => rng.next();
    let name = draw(f.kind, next);
    for (let tries = 0; taken.has(name) && tries < 50; tries++) name = draw(f.kind, next);
    taken.add(name);
    return name;
  });
}

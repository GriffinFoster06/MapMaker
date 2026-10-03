# Design note 2: Language evolution

| | |
|---|---|
| Status | Draft for Checkpoint 2 |
| Built in | Phase 13d (proto-languages and t0 names can land with Phase 10) |
| Depends on | Note 1 (tick and cultures), note 9 (population contact), Azgaar `names-generator.ts` |

## 1. Problem

Names must come from a language state that changes over time. Azgaar generates culture-specific names from Markov chains trained on fixed name bases (`names-generator.ts`). It has no phonology, lexicon, sound change or family trees (matrix gap 2).

**Requirements:**
- languages descend from proto-languages, split into families, borrow from each other, and change regularly;
- place and person names at tick t are derived from the language spoken there at t;
- renaming follows conquest and settlement.

## 2. Canonical inputs and outputs

**Inputs**
- cultures and their territories (note 9);
- the contact graph (trade volume and shared borders);
- population sizes;
- isolation;
- tick.

**Entities** (`timeAxis: 'history'`)
- **`languages`:**
  - parent id and the split tick;
  - phoneme inventory (consonants and vowels as feature bundles);
  - phonotactics (syllable templates with weights, onset and coda constraints);
  - stress rule;
  - morphology sketch (affix order, a few affixes);
  - **lexicon:** meaning id → phonemic form;
  - the history of applied sound changes, as an ordered rule list with ticks;
  - a romanisation table.
- **`toponyms`:** for each feature (settlement, river, region, mountain), a name per language over a validity interval, with an etymology (meaning ids, source language, tick coined).

**Layer:** `language` (Int32 per cell, time-varying).

**Events:** language split, sound change adopted, word borrowed, toponym coined, toponym renamed.

## 3. Approach and algorithm choice

### 3.1 Proto-language generation

- **Phoneme inventory.** Inventories are drawn from typologically weighted feature sets, so common segments (/p t k m n i a u/) are almost always present and rare ones are rare. Size distributions follow published typology (Maddieson 1984). The weights are hand-authored, so no dataset is vendored. If PHOIBLE is used for calibration, it is downloaded at tuning time with its license checked (Q8).
- **Phonotactics.** Syllable templates are drawn from a typologically weighted set (CV, CVC, CCV and others), with sonority sequencing enforced.
- **Lexicon.** A core meaning list of about 200 concepts in Swadesh style, public domain, extended with about 300 toponym-relevant roots (river, hill, white, ford, fort, new, holy, and so on). Each meaning gets a form drawn from the phonotactics. Length is anti-correlated with meaning frequency, so common words are short.

### 3.2 Change over time

At every language step (every 10 ticks by default):
- **Regular sound change.** A rule is adopted with a hazard proportional to the time since the last change. Rules come from a typed catalogue: lenition, voicing assimilation, final devoicing, palatalisation before front vowels, vowel shifts (chain shifts), loss of final vowels or consonants, cluster simplification, and tone or length phonologisation as rare cases.
  - Rules are written in an SCA-style notation, target / environment, at the algorithm level of Rosenfelder's Sound Change Applier.
  - They apply to the **whole lexicon at once**. That is what makes cognates regular.
- **Lexical replacement.** Each meaning is replaced with probability r_m·Δt. The per-meaning rate r_m is inversely related to word frequency (Pagel, Atkinson & Meade 2007). The replacement is either a new coinage or a borrowing from a contact language.
- **Borrowing.** Contact intensity between languages A and B comes from trade volume and the bilingual population on shared borders. Borrowed forms are adapted to the borrower's phonotactics.
- **Split.** When a culture's territory becomes disconnected, or its internal contact drops below a threshold (distance, borders), the language splits. Each daughter then changes independently, giving family trees with regular correspondences.

### 3.3 Names

- A **toponym** is coined when a feature first gets a name, or is renamed. The name is a compound of lexicon roots chosen from the feature's attributes (river + white; ford + oak; new + settlement). It is formed by the language's morphology and romanised.
- **Diachronic evolution.** Existing toponyms undergo the same sound changes as the language, so old names erode naturally (e.g. *Londinium* → *London*). A name is renamed when the dominant language of the place changes and a renaming draw succeeds. Otherwise the old name is borrowed, phonologically adapted, into the new language.
- **Person names** for event-log figures are made from lexicon roots with name morphology.
- **Azgaar at t0.** For each language, an Azgaar-style Markov chain is **trained on that language's own generated words** (`names-generator.ts` `calculateChain`, extracted). It fills in names wherever compounding is unsuitable. Azgaar's name bases are not used as phonological sources, so t0 names are already consistent with the proto-language.

### 3.4 Determinism and cost

- Every draw is keyed: `(stream 'lang', tick, languageId, k)`.
- Sound changes are applied lazily: a form at tick t is computed by applying the rule history up to t, with a cache.
- Cost is a few hundred languages × 500 forms per step, which is negligible.

## 4. Upstream references (algorithm level)

- **Azgaar** `names-generator.ts` (Markov chain over syllables), extracted with an injected RNG.
- **Sound-change rule format:** Rosenfelder's SCA² (zompist.com), as an algorithm idea only.
- **Literature:**
  - Swadesh (1955), basic vocabulary, public domain;
  - Pagel, Atkinson & Meade (2007), *Nature* 449, frequency-dependent replacement;
  - Maddieson, *Patterns of Sounds* (1984);
  - Campbell, *Historical Linguistics* (3rd ed., 2013), the sound-change typology.

## 5. Validation

- **Regularity.** After N steps, for daughter languages A and B of one parent, segment correspondences across cognates follow the applied rules exactly. A test re-derives each daughter form from the proto form through the rule history.
- **Tree recovery.** Lexical distances between living languages, clustered with neighbour-joining, recover the true family tree: Robinson–Foulds distance ≤ 20% of the maximum, over 10 seeds.
- **Plausibility.** Inventory sizes fall within typological bounds. No syllable violates its language's phonotactics. Names are pronounceable under the language's own rules.
- **Name stability.** Lifetimes of major toponyms are long, with bounds set at Checkpoint 13d, and renaming follows conquest.
- **Determinism and resume.** Hashes are compared across save and resume.

## 6. Open questions

1. **Romanisation:** one global scheme, or per language (exonyms)? I propose per language, with an optional global "atlas" scheme.
2. **Writing systems** (scripts) are out of scope unless you want them.

## 7. Size estimate

| Part | LOC (TS) |
|---|---|
| Phonology and phonotactics generator | ~800 |
| Lexicon | ~400 |
| Sound-change engine and catalogue | ~1,200 |
| Replacement, borrowing, split | ~700 |
| Toponymy and romanisation | ~700 |
| Azgaar chain extraction | ~200 |
| Tests (regularity, tree recovery) | ~1,000 |
| **Total** | **~5,000** |

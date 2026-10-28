import { expect, test } from '@playwright/test';

// Phase 6a M6 (design note 20): the Sky section of the Planet panel. Star and moon presets, the readout and the validity
// badge, the sky reaching the generator (Earth's sky sends nothing, so the world is the default world), and the link.
test('sky panel: presets, badge, generation and link', async ({ page }) => {
  test.setTimeout(240_000);
  await page.goto('./');
  await page.waitForFunction(() => !!window.__globe && !!window.__flat);
  await page.locator('#planet > summary').click();

  await expect(page.locator('#skyBadge')).toHaveText('Earth\'s sky');
  await page.selectOption('#skyMoons', 'two-moons');
  await expect(page.locator('#skyBadge')).toContainText('Sky: Year 365 days');
  await expect(page.locator('#skyReadout')).toContainText('solar eclipses a year');
  expect(page.url()).toContain('as_moons=two-moons');

  // A dim star with the planet pulled in to 0.3 AU is tidally locked: outside the climate model.
  await page.selectOption('#skyStar', 'm-dwarf');
  await page.locator('#pl-distance').evaluate((el: HTMLInputElement) => { el.value = '0.3'; el.dispatchEvent(new Event('input')); });
  await expect(page.locator('#skyBadge')).toContainText('outside model validity');
  await expect(page.locator('#skyBadge')).toHaveAttribute('data-validity', 'unsupported');
  expect(page.url()).toContain('as_star=m-dwarf');

  // The sky reaches the generator: no moon is a different world; Earth's sky (nothing sent) is the default world.
  const hash = async (astro?: unknown) => {
    await page.evaluate((a) => window.__globe!.generate({ N: 20000, seed: 4242, ...(a ? { astro: a } : {}) } as never), astro);
    return page.evaluate(() => window.__flat!.worldHash());
  };
  const earth = await hash();
  const noMoon = await hash({
    star: { massSolar: 1, ageGyr: 4.6, luminosity_W: 3.846e26, teff_K: 5772, radius_m: 6.957e8 },
    planet: { semiMajorAxis_AU: 1.00000011, eccentricity: 0.0167, obliquity_deg: 23.44, rotationPeriod_s: 86164.0905, longPerihelion_deg: 102.94719, mass_kg: 5.972e24, radius_m: 6.371e6 },
    moons: [],
  });
  expect(noMoon).not.toBe(earth);
  expect(await hash()).toBe(earth);

  // The parity pipeline is stock orogen: Earth's sky only.
  await page.selectOption('#pipeline', 'parity');
  await page.click('#generate');
  await expect(page.locator('#status')).toContainText('needs the structured pipeline');
  await page.selectOption('#pipeline', 'structured');

  // Reset returns to Earth, the badge and the link follow.
  await page.click('#resetPlanet');
  await expect(page.locator('#skyBadge')).toHaveText('Earth\'s sky');
  expect(page.url()).not.toContain('as_');
});

test('a link with a sky opens the panel with it', async ({ page }) => {
  await page.goto('./?as_star=binary&as_moons=none');
  await page.waitForFunction(() => !!window.__globe);
  await expect(page.locator('#planet')).toHaveAttribute('open', '');
  expect(await page.locator('#skyStar').inputValue()).toBe('binary');
  expect(await page.locator('#skyMoons').inputValue()).toBe('none');
  await expect(page.locator('#skyBadge')).toContainText('Sky:');
});

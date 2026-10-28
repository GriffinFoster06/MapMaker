import { expect, test } from '@playwright/test';

// Phase 6 M4 (design note 10): the Planet panel. A preset fills the sliders and the validity badge, the planet reaches
// the generator (a different world), Earth's values send no planet, so the world is the default world, a shared link carries the
// planet, and the stock-orogen (parity) pipeline refuses another planet with a message.
test('planet panel: presets, badge, generation and link', async ({ page }) => {
  test.setTimeout(240_000);
  await page.goto('./');
  await page.waitForFunction(() => !!window.__globe && !!window.__flat);
  await page.locator('#planet > summary').click();

  await expect(page.locator('#planetBadge')).toHaveText('Earth');
  await page.selectOption('#planetPreset', 'mars-like');
  await expect(page.locator('#planetBadge')).toContainText('outside model validity');
  await expect(page.locator('#planetBadge')).toHaveAttribute('data-validity', 'unsupported');
  expect(await page.locator('#pl-radius').inputValue()).toBe('0.53');
  expect(await page.locator('#set-landCoverage').inputValue()).toBe('0.7'); // the preset writes the world setting it implies
  expect(page.url()).toContain('pl_radius=0.53');

  // The planet reaches the generator: a Mars-sized planet is a different world; Earth's values are the default world.
  const hash = async (planet?: Record<string, number>) => {
    await page.evaluate((p) => window.__globe!.generate({ N: 20000, seed: 4242, ...(p ? { planet: p } : {}) }), planet);
    return page.evaluate(() => window.__flat!.worldHash());
  };
  const earth = await hash();
  expect(await hash({})).toBe(earth); // Earth's values send no planet at all, so the stored params (and the World hash) are unchanged
  const small = await hash({ radius_m: 3.389e6 });
  expect(small).not.toBe(earth);
  expect(await page.evaluate(() => window.__globe!.litFraction())).toBeGreaterThan(0.1);

  // Registry levels: the simple level shows only the axial tilt.
  await page.selectOption('#level', 'simple');
  await expect(page.locator('#planetGroups .setting:not([hidden])')).toHaveCount(1);
  await page.selectOption('#level', 'advanced');

  // A different planet needs the structured pipeline.
  await page.selectOption('#pipeline', 'parity');
  await page.click('#generate');
  await expect(page.locator('#status')).toContainText('needs the structured pipeline');

  // Reset returns to Earth, the badge and the link follow.
  await page.click('#resetPlanet');
  await expect(page.locator('#planetBadge')).toHaveText('Earth');
  expect(page.url()).not.toContain('pl_');
});

test('a link with planet values opens the panel with them', async ({ page }) => {
  await page.goto('./?pl_obliquity=45&pl_rotation=30');
  await page.waitForFunction(() => !!window.__globe);
  await expect(page.locator('#planet')).toHaveAttribute('open', '');
  expect(await page.locator('#pl-obliquity').inputValue()).toBe('45');
  expect(await page.locator('#pl-rotation').inputValue()).toBe('30');
  await expect(page.locator('#planetBadge')).toContainText('extrapolated');
});

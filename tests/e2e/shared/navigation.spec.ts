import { expect, test } from '@playwright/test';

test.describe('desktop header', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('skip link moves focus to the main content', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('Tab');
    const skip = page.getByRole('link', { name: 'Skip to content' });
    await expect(skip).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('main#main')).toBeFocused();
  });

  test('menus open from the keyboard, move focus in and return it on Esc', async ({ page }) => {
    await page.goto('/');
    const learn = page.getByRole('button', { name: /^Learn/ });
    await learn.focus();
    await page.keyboard.press('Enter');
    await expect(learn).toHaveAttribute('aria-expanded', 'true');
    const panel = page.locator('#menu-learn');
    await expect(panel).toBeVisible();
    await expect(learn).toHaveAttribute('aria-controls', 'menu-learn');
    await expect(panel.getByRole('link').first()).toBeFocused();
    await expect(panel.getByRole('link')).toHaveText([
      /Learning Notes/,
      /Roadmap/,
      /Mind Maps/,
      /Resources/,
    ]);

    await page.keyboard.press('Escape');
    await expect(panel).toBeHidden();
    await expect(learn).toHaveAttribute('aria-expanded', 'false');
    await expect(learn).toBeFocused();
  });

  test('only one menu is open at a time and an outside click closes it', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /^Learn/ }).click();
    await page.getByRole('button', { name: /^Practice/ }).click();
    await expect(page.locator('#menu-learn')).toBeHidden();
    await expect(page.locator('#menu-practice')).toBeVisible();
    await expect(page.locator('#menu-practice').getByRole('link')).toHaveText([
      /Interview Questions/,
      /Cheat Sheets/,
    ]);
    await page.locator('h1').click();
    await expect(page.locator('#menu-practice')).toBeHidden();
  });

  test('choosing an item navigates, closes the menu and marks the current page', async ({
    page,
  }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /^Tracks/ }).click();
    const tracks = page.locator('#menu-tracks').getByRole('link');
    await expect(tracks).toHaveCount(5);
    await tracks.filter({ hasText: 'System Design' }).click();
    await expect(page).toHaveURL(/\/tracks\/system-design$/);
    await expect(page.locator('#menu-tracks')).toBeHidden();

    const button = page.getByRole('button', { name: /^Tracks/ });
    await expect(button).toContainText('(current section)');
    await button.click();
    const current = page.locator('#menu-tracks [aria-current="page"]');
    await expect(current).toHaveCount(1);
    await expect(current).toContainText('System Design');
    await expect(current).toContainText("You're here");
  });

  test('keyboard-only: tab to a track card and open it', async ({ page }) => {
    await page.goto('/');
    const card = page.locator('#tracks').getByRole('link', { name: /DSA with Python/ });
    for (let i = 0; i < 40 && !(await card.evaluate((el) => el === document.activeElement)); i++) {
      await page.keyboard.press('Tab');
    }
    await expect(card).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/tracks\/dsa-python$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('DSA with Python');
  });

  test('every interactive element has a visible focus ring', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /^Learn/ }).focus();
    await page.keyboard.press('Tab');
    const outline = await page.evaluate(
      () => getComputedStyle(document.activeElement as Element).outlineStyle,
    );
    expect(outline).not.toBe('none');
  });
});

test.describe('theme', () => {
  test('toggle switches theme, remembers it and applies it before paint', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/');
    await expect(page.locator('html')).toHaveClass(/\blight\b/);
    await page.getByRole('button', { name: 'Toggle colour theme' }).first().click();
    await expect(page.locator('html')).toHaveClass(/\bdark\b/);
    await page.reload();
    await expect(page.locator('html')).toHaveClass(/\bdark\b/);
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(bg).toBe('rgb(15, 17, 21)');
  });

  test('follows the system theme by default', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/');
    await expect(page.locator('html')).toHaveClass(/\bdark\b/);
  });
});

test.describe('mobile drawer', () => {
  test.use({ viewport: { width: 375, height: 740 } });

  test('opens, traps focus, closes on Esc and returns focus', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('button', { name: /^Learn/ })).toBeHidden();
    const open = page.getByRole('button', { name: 'Open menu' });
    await open.click();
    const drawer = page.getByRole('dialog', { name: 'Menu' });
    await expect(drawer).toBeVisible();
    await expect(drawer.getByLabel('Track', { exact: true })).toBeVisible();
    await expect(drawer.getByRole('navigation', { name: 'Tracks' }).getByRole('link')).toHaveCount(
      5,
    );
    await expect(drawer.getByRole('button', { name: 'Toggle colour theme' })).toBeVisible();

    for (let i = 0; i < 25; i++) {
      await page.keyboard.press('Tab');
      const inside = await drawer.evaluate((d) => d.contains(document.activeElement));
      expect(inside).toBe(true);
    }

    await page.keyboard.press('Escape');
    await expect(drawer).toBeHidden();
    await expect(open).toBeFocused();
  });

  test('track select opens the track hub', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Open menu' }).click();
    await page
      .getByRole('dialog')
      .getByLabel('Track', { exact: true })
      .selectOption('gen-ai-engineer');
    await expect(page).toHaveURL(/\/tracks\/gen-ai-engineer$/);
    await expect(page.getByRole('dialog')).toBeHidden();
  });

  test('has no horizontal scroll at 360px', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    for (const path of ['/', '/tracks/system-design', '/learning-notes']) {
      await page.goto(path);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      );
      expect(overflow, path).toBeLessThanOrEqual(0);
    }
  });
});

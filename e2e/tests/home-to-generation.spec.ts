import { test, expect } from '../fixtures/base';
import { HomePage } from '../pages/home.page';
import { createSettingsStorage } from '../fixtures/test-data/settings';
import type { Page } from '@playwright/test';

// Inject settings with modelId so the "enter classroom" button works
const SETTINGS_STORAGE = createSettingsStorage();

interface BodySpacing {
  paddingRight: string;
  marginRight: string;
}

async function readBodySpacing(page: Page): Promise<BodySpacing> {
  return page.evaluate(() => {
    const styles = getComputedStyle(document.body);
    return {
      paddingRight: styles.paddingRight,
      marginRight: styles.marginRight,
    };
  });
}

async function expectBodyScrollState(page: Page, initialSpacing: BodySpacing, locked: boolean) {
  await expect
    .poll(() =>
      page.evaluate(() => ({
        locked: document.body.hasAttribute('data-scroll-locked'),
        paddingRight: getComputedStyle(document.body).paddingRight,
        marginRight: getComputedStyle(document.body).marginRight,
      })),
    )
    .toEqual({
      locked,
      paddingRight: initialSpacing.paddingRight,
      marginRight: initialSpacing.marginRight,
    });
}

test.describe('Home → Generation', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript((settings) => {
      localStorage.setItem('settings-storage', settings);
      localStorage.setItem('locale', 'en-US');
    }, SETTINGS_STORAGE);
  });

  test('home page loads with core UI elements and submits requirement', async ({ page }) => {
    const home = new HomePage(page);
    await home.goto();

    // Core elements visible
    await expect(home.logo).toBeVisible();
    await expect(home.textarea).toBeVisible();
    await expect(home.enterButton).toBeDisabled();

    // Type requirement → button activates
    await home.fillRequirement('讲解光合作用');
    await expect(home.enterButton).toBeEnabled();

    // Submit → navigate to generation-preview
    await home.submit();
    await page.waitForURL(/\/generation-preview/);
    expect(page.url()).toContain('/generation-preview');
  });

  test('loads the artificial intelligence demo course', async ({ page }) => {
    const home = new HomePage(page);
    await home.goto();

    // The DemoSeedButton component hardcodes Chinese text (not i18n),
    // so the button label is 秒开缓存演示课程 even in en-US locale.
    await page.getByRole('button', { name: '秒开缓存演示课程' }).click();
    await expect(page.getByText('人工智能导论', { exact: true }).last()).toBeVisible();
    await page.getByText('人工智能导论', { exact: true }).last().click();
    await page.waitForURL(/\/classroom\/demo-ai-course/);
  });

  test('keeps body spacing stable when the settings dialog opens', async ({ page }) => {
    const home = new HomePage(page);
    await home.goto();
    await expect(home.logo).toBeVisible();

    const initialBodySpacing = await readBodySpacing(page);

    await page.locator('button:has(svg.lucide-settings)').first().click();
    await expect(page.getByRole('dialog', { name: 'Settings' })).toBeVisible();
    await expectBodyScrollState(page, initialBodySpacing, true);
  });
});

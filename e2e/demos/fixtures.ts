import { test as base } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Overlay } from './overlay';

const here = dirname(fileURLToPath(import.meta.url));
export const OUTPUT_DIR = resolve(here, '..', 'demo-output');

/**
 * Each demo test records one video. The test title IS the output slug —
 * `demo('howto-first-card', …)` ends up at `demo-output/howto-first-card.webm`
 * — so keep titles to slug-safe characters.
 */
export const test = base.extend<{ demo: Overlay }>({
  demo: async ({ page }, use, testInfo) => {
    await Overlay.install(page);
    const overlay = new Overlay(page);
    mkdirSync(OUTPUT_DIR, { recursive: true });
    overlay.posterPath = resolve(OUTPUT_DIR, `${testInfo.title}.jpg`);
    await use(overlay);

    // The video file is only finalized once the page closes; save it under
    // the slug name rather than Playwright's hashed artifact path.
    const video = page.video();
    await page.close();
    if (video && testInfo.status === 'passed') {
      mkdirSync(OUTPUT_DIR, { recursive: true });
      await video.saveAs(resolve(OUTPUT_DIR, `${testInfo.title}.webm`));
    }
  },
});

export const expect = test.expect;

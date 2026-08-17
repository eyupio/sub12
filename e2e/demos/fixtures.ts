import { test as base } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Overlay } from './overlay';
import { trimRecording } from './trimVideo';

const here = dirname(fileURLToPath(import.meta.url));
export const OUTPUT_DIR = resolve(here, '..', 'demo-output');

/**
 * Each demo test records one video. The test title IS the output slug —
 * `demo('howto-first-card', …)` ends up at `demo-output/howto-first-card.webm`
 * — so keep titles to slug-safe characters.
 */
export const test = base.extend<{ demo: Overlay }>({
  demo: async ({ page }, use, testInfo) => {
    // Filming has already started: the page exists, so everything the test does
    // before its first overlay — seeding, signing in, waiting for the app to
    // load — is on film. `Overlay` marks where the demo really begins and the
    // trim below cuts back to it.
    const recordingStartedAt = Date.now();
    await Overlay.install(page);
    const overlay = new Overlay(page, recordingStartedAt);
    mkdirSync(OUTPUT_DIR, { recursive: true });
    overlay.posterPath = resolve(OUTPUT_DIR, `${testInfo.title}.jpg`);
    await use(overlay);

    // The video file is only finalized once the page closes; save it under
    // the slug name rather than Playwright's hashed artifact path.
    const video = page.video();
    await page.close();
    if (video && testInfo.status === 'passed') {
      mkdirSync(OUTPUT_DIR, { recursive: true });
      const path = resolve(OUTPUT_DIR, `${testInfo.title}.webm`);
      await video.saveAs(path);
      const trimmed = trimRecording(path, overlay.filmStartMs);
      if (trimmed) {
        console.info(
          `${testInfo.title}: cut ${(trimmed.trimmedMs / 1000).toFixed(1)}s of lead-in, ` +
            `film is ${(trimmed.durationMs / 1000).toFixed(1)}s`,
        );
      }
    }
  },
});

export const expect = test.expect;

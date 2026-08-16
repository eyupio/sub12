import type { Browser, Page } from '@playwright/test';
import type { Overlay } from './overlay';
import type { DemoApi } from './session';

/**
 * Shared machinery for the pellet-testing recordings.
 *
 * The hole detector (frontend/src/utils/holeDetection.ts) wants dark blobs on
 * a lighter local background, with a radius near (pelletDiameter/2)×pixelsPerMM
 * and clear separation between holes. The generated "photo" is built to those
 * rules: a 1200×900 paper-coloured card, faint printed rings (too thin to
 * register as blobs), five near-black holes of ~27px radius, and a 550px scale
 * bar the script calibrates as 5.5cm — giving 10px/mm, so a .22 marker expects
 * ~27.5px holes. Squares would work (the unit tests prove it); circles score
 * higher on the detector's circularity term.
 */

const TARGET_W = 1200;
const TARGET_H = 900;
// Image-space landmarks the driver clicks on (fractions of width/height).
export const AIM = { x: 610 / TARGET_W, y: 420 / TARGET_H };
export const SCALE_A = { x: 200 / TARGET_W, y: 820 / TARGET_H };
export const SCALE_B = { x: 750 / TARGET_W, y: 820 / TARGET_H };
export const SCALE_CM = '5.5';

const HOLES = [
  { x: 555, y: 375 },
  { x: 650, y: 390 },
  { x: 575, y: 465 },
  { x: 668, y: 468 },
  { x: 612, y: 320 },
];

function targetSvg(): string {
  // Decorative print must stay ABOVE the detector's local threshold (~80% of
  // paper brightness) or a thin ring's area-derived radius mimics a pellet
  // hole. The scale bar goes the other way: solid and fat, so its blob radius
  // overshoots the size gate and is rejected outright.
  const rings = [60, 120, 180, 240, 300]
    .map((r) => `<circle cx="610" cy="420" r="${r}" fill="none" stroke="#cfc7b1" stroke-width="2"/>`)
    .join('');
  const holes = HOLES.map(
    ({ x, y }) =>
      `<circle cx="${x}" cy="${y}" r="30" fill="none" stroke="#d9d2c0" stroke-width="5"/>` +
      `<circle cx="${x}" cy="${y}" r="27" fill="#23211d"/>` +
      `<circle cx="${x - 6}" cy="${y - 7}" r="7" fill="#3d3a33"/>`,
  ).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${TARGET_W}" height="${TARGET_H}">
    <rect width="100%" height="100%" fill="#efe9da"/>
    <rect x="24" y="24" width="${TARGET_W - 48}" height="${TARGET_H - 48}" fill="none" stroke="#cfc7b1" stroke-width="3"/>
    ${rings}
    <circle cx="610" cy="420" r="7" fill="none" stroke="#c5bca6" stroke-width="2"/>
    <line x1="610" y1="390" x2="610" y2="450" stroke="#c5bca6" stroke-width="2"/>
    <line x1="580" y1="420" x2="640" y2="420" stroke="#c5bca6" stroke-width="2"/>
    ${holes}
    <rect x="200" y="805" width="550" height="30" fill="#3a362f"/>
    <text x="475" y="860" font-family="sans-serif" font-size="26" fill="#5c564a" text-anchor="middle">5.5 cm</text>
    <text x="610" y="80" font-family="sans-serif" font-size="30" fill="#5c564a" text-anchor="middle">SUB12 · 25m PRACTICE CARD</text>
  </svg>`;
}

/** Render the synthetic target photo in an unrecorded context. */
export async function generateTargetImage(browser: Browser, outPath: string): Promise<void> {
  const ctx = await browser.newContext({ viewport: { width: TARGET_W, height: TARGET_H } });
  const page = await ctx.newPage();
  await page.setContent(`<body style="margin:0">${targetSvg()}</body>`);
  await page.screenshot({
    path: outPath,
    type: 'jpeg',
    quality: 90,
    clip: { x: 0, y: 0, width: TARGET_W, height: TARGET_H },
  });
  await ctx.close();
}

/**
 * Click an image-space fraction on the measurement canvas. The component
 * contain-fits the image at 95% and centres it (ImageMeasurement.tsx:212-214),
 * so the display transform has to be inverted — the canvas is not the image.
 */
export async function tapCanvas(page: Page, frac: { x: number; y: number }): Promise<void> {
  const canvas = page.locator('canvas').first();
  const box = await canvas.boundingBox();
  if (!box) throw new Error('measurement canvas not visible');
  const scale = Math.min(box.width / TARGET_W, box.height / TARGET_H) * 0.95;
  const ox = (box.width - TARGET_W * scale) / 2;
  const oy = (box.height - TARGET_H * scale) / 2;
  await page.mouse.click(
    box.x + ox + frac.x * TARGET_W * scale,
    box.y + oy + frac.y * TARGET_H * scale,
  );
}

export interface MeasureResult {
  detectedLine: string;
}

/**
 * The measurement panel re-renders every autosave tick, so Playwright's
 * stability checks see a perpetual detach/attach cycle and time out. Click
 * through the DOM instead: wait until a button with this label is enabled,
 * then click that exact node in-page.
 */
export async function domClick(page: Page, label: string): Promise<void> {
  try {
    await page.waitForFunction(
      (l) =>
        Array.from(document.querySelectorAll('button')).some(
          (b) => (b.textContent ?? '').trim().startsWith(l) && !(b as HTMLButtonElement).disabled,
        ),
      label,
      { timeout: 20_000 },
    );
  } catch (err) {
    const buttons = await page.evaluate(() =>
      Array.from(document.querySelectorAll('button'))
        .map((b) => `${(b.textContent ?? '').trim().slice(0, 30)}${(b as HTMLButtonElement).disabled ? '[disabled]' : ''}`)
        .filter(Boolean)
        .join(' | '),
    );
    throw new Error(`domClick('${label}') timed out; buttons on page: ${buttons}`, { cause: err });
  }
  await page.evaluate((l) => {
    const b = Array.from(document.querySelectorAll('button')).find(
      (x) => (x.textContent ?? '').trim().startsWith(l) && !(x as HTMLButtonElement).disabled,
    ) as HTMLButtonElement;
    b.click();
  }, label);
}

/**
 * Drive the 5-step canvas measurement (aim → calibrate → distance → auto
 * detect → summary). Assumes the wizard is on the Measure step with the
 * generated photo loaded.
 */
/**
 * The canvas is remounted on every autosave re-render, which can swallow a
 * tap. Tap, then verify the tap actually took effect (via `took`); retry a
 * few times before giving up.
 */
async function tapCanvasUntil(
  page: Page,
  frac: { x: number; y: number },
  took: () => Promise<boolean>,
): Promise<void> {
  for (let attempt = 0; attempt < 6; attempt++) {
    await tapCanvas(page, frac);
    await page.waitForTimeout(400);
    if (await took()) return;
  }
  throw new Error('canvas tap never registered');
}

function buttonEnabled(page: Page, label: string): () => Promise<boolean> {
  return () =>
    page.evaluate(
      (l) =>
        Array.from(document.querySelectorAll('button')).some(
          (b) => (b.textContent ?? '').trim().startsWith(l) && !(b as HTMLButtonElement).disabled,
        ),
      label,
    );
}

function buttonShowsTick(page: Page, label: string): () => Promise<boolean> {
  return () =>
    page.evaluate(
      (l) =>
        Array.from(document.querySelectorAll('button')).some((b) => {
          const t = (b.textContent ?? '').trim();
          return t.startsWith(l) && t.includes('✓');
        }),
      label,
    );
}

/** Click `label` if it is enabled right now — one atomic evaluate, no gap. */
function clickIfEnabled(page: Page, label: string): Promise<boolean> {
  return page.evaluate((l) => {
    const b = Array.from(document.querySelectorAll('button')).find(
      (x) => (x.textContent ?? '').trim().startsWith(l) && !(x as HTMLButtonElement).disabled,
    ) as HTMLButtonElement | undefined;
    if (!b) return false;
    b.click();
    return true;
  }, label);
}

function textVisible(page: Page, text: string): () => Promise<boolean> {
  return () => page.evaluate((t) => (document.body.innerText ?? '').includes(t), text);
}

export async function driveMeasurement(page: Page, demo: Overlay, captions: boolean): Promise<MeasureResult> {
  // 1. Aim point. An autosave remount can wipe the tapped aim point before
  // NEXT is pressed, so tap → click-NEXT-if-enabled → verify step 2 arrived,
  // and retry the whole sequence when the remount wins the race.
  if (captions) await demo.caption('Mark the aim point…', 800);
  let onStep2 = false;
  for (let attempt = 0; attempt < 8 && !onStep2; attempt++) {
    await tapCanvas(page, AIM);
    await page.waitForTimeout(300);
    if (await clickIfEnabled(page, '> NEXT')) {
      await page.waitForTimeout(300);
      onStep2 = await buttonEnabled(page, 'SET POINT A')();
    }
  }
  if (!onStep2) throw new Error('could not set the aim point (step 1 → 2)');

  // 2. Calibration: two taps on the printed scale bar + its real length.
  if (captions) await demo.caption('…tell it how big the card really is…', 800);
  let onStep3 = false;
  for (let attempt = 0; attempt < 8 && !onStep3; attempt++) {
    await domClick(page, 'SET POINT A');
    await tapCanvasUntil(page, SCALE_A, buttonShowsTick(page, 'SET POINT A'));
    await domClick(page, 'SET POINT B');
    await tapCanvasUntil(page, SCALE_B, buttonShowsTick(page, 'SET POINT B'));
    await page.getByPlaceholder('5.5').fill(SCALE_CM);
    await demo.beat(600);
    if (await clickIfEnabled(page, '> NEXT')) {
      await page.waitForTimeout(300);
      onStep3 = await textVisible(page, 'Impact marker size')();
    }
  }
  if (!onStep3) throw new Error('could not calibrate the scale (step 2 → 3)');

  // 3. Range and pellet size. The panel detaches/reattaches every autosave
  // tick, so set the controls straight through the DOM with native setters.
  await page.getByText('Impact marker size').waitFor();
  await page.evaluate(() => {
    const describe = () =>
      Array.from(document.querySelectorAll('button, input, select'))
        .map((el) => `${el.tagName}:${(el as HTMLElement).innerText || (el as HTMLInputElement).value || ''}`)
        .slice(0, 30)
        .join(' | ');
    const input = Array.from(document.querySelectorAll<HTMLInputElement>('input[type="number"]')).find(
      (el) => el.offsetParent !== null,
    );
    if (!input) throw new Error(`step-3 distance input not found; controls: ${describe()}`);
    const inputSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
    inputSetter.call(input, '25');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    const select = Array.from(document.querySelectorAll<HTMLSelectElement>('select')).find(
      (el) => el.offsetParent !== null,
    );
    if (!select) throw new Error(`step-3 marker select not found; controls: ${describe()}`);
    const selectSetter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value')!.set!;
    selectSetter.call(select, '.22');
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await demo.beat(500);
  await domClick(page, '> NEXT');

  // 4. Auto-detect the holes (AUTO DETECT only exists in MARK IMPACTS mode).
  if (captions) await demo.caption('…and sub12 finds the holes itself.', 600);
  await domClick(page, 'MARK IMPACTS');
  await domClick(page, 'AUTO DETECT');
  const status = page.getByText(/Detected \d+ holes?/);
  await status.waitFor({ timeout: 20_000 });
  const detectedLine = (await status.textContent()) ?? '';
  await demo.beat(1400);
  await domClick(page, '> ANALYZE');

  // 5. Summary.
  await page.getByText('Group Analysis Results').waitFor();
  return { detectedLine };
}

function items<T>(res: unknown): T[] {
  if (Array.isArray(res)) return res as T[];
  if (res && typeof res === 'object') {
    const inner = (res as { items?: unknown }).items;
    if (Array.isArray(inner)) return inner as T[];
  }
  return [];
}

/** Remove the demo account's pellet tests so reruns start clean. */
export async function deleteAllPelletTests(api: DemoApi): Promise<void> {
  for (const t of items<{ id: string }>(await api.get('/pellet-tests'))) {
    await api.delete(`/pellet-tests/${t.id}`);
  }
}

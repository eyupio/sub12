import type { Page } from '@playwright/test';

/**
 * In-page overlays baked into the recording: a title card, a lower-third
 * caption bar, an end card, and a cursor dot (Playwright records no OS
 * cursor). Everything is injected into the live page, so the exported video
 * needs no post-production.
 *
 * The cursor is installed via addInitScript so it survives navigations; the
 * caption is a DOM node in the current document, so `caption()` must be
 * called after a navigation settles, not before.
 */

const GOLD = '#d4a44a';
const PANEL = 'rgba(12, 12, 15, 0.82)';
const FONT =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

const CURSOR_INIT = `(() => {
  const mount = () => {
    if (document.getElementById('__demo_cursor')) return;
    const c = document.createElement('div');
    c.id = '__demo_cursor';
    c.style.cssText = [
      'position:fixed', 'left:-100px', 'top:-100px', 'width:22px', 'height:22px',
      'margin:-11px 0 0 -11px', 'border-radius:50%',
      'background:rgba(212,164,74,0.35)', 'border:2px solid ${GOLD}',
      'box-shadow:0 1px 6px rgba(0,0,0,0.35)',
      'pointer-events:none', 'z-index:2147483646',
      'transition:transform 120ms ease',
    ].join(';');
    document.documentElement.appendChild(c);
    window.addEventListener('mousemove', (e) => {
      c.style.left = e.clientX + 'px';
      c.style.top = e.clientY + 'px';
    }, true);
    window.addEventListener('mousedown', () => {
      c.style.transform = 'scale(0.6)';
    }, true);
    window.addEventListener('mouseup', () => {
      c.style.transform = 'scale(1)';
    }, true);
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }
})();`;

export class Overlay {
  /** Set by the fixture; where saveMoment() writes the poster jpeg. */
  posterPath: string | null = null;

  /**
   * Where the finished film starts: the moment the first overlay went up,
   * measured from the start of the recording. Everything before it is the app
   * loading, which is dead air on screen — the fixture cuts it off. Null until
   * a demo puts something on screen.
   */
  filmStartMs: number | null = null;

  constructor(
    private readonly page: Page,
    private readonly recordingStartedAt: number,
  ) {}

  /**
   * The first overlay is the demo's first frame. A little lead-in keeps the
   * fade from being clipped if the clock and the film have drifted apart.
   */
  private markFilmStart(): void {
    if (this.filmStartMs === null) {
      this.filmStartMs = Math.max(0, Date.now() - this.recordingStartedAt - 250);
    }
  }

  /**
   * Capture the current frame as the video's poster image. Call it at the
   * most representative moment of the demo (Playwright's bundled ffmpeg can
   * only encode VP8, so posters are screenshots, not extracted frames).
   */
  async saveMoment(): Promise<void> {
    if (!this.posterPath) return;
    await this.page.screenshot({ path: this.posterPath, type: 'jpeg', quality: 82 });
  }

  /** Call once on the context before the first navigation. */
  static async install(page: Page): Promise<void> {
    await page.context().addInitScript(CURSOR_INIT);
  }

  /** Pause so the viewer can take a state in. */
  async beat(ms = 1200): Promise<void> {
    await this.page.waitForTimeout(ms);
  }

  /** Full-frame intro card, shown for ~2.5s. */
  async title(kind: 'Showcase' | 'How-to', title: string): Promise<void> {
    await this.card(kind.toUpperCase(), title, 'SUB12 — the target shooting companion');
  }

  /** Full-frame outro card. */
  async end(text: string, sub = 'sub12.io'): Promise<void> {
    await this.card('', text, sub, 3000);
  }

  private async card(label: string, heading: string, sub: string, hold = 2500): Promise<void> {
    this.markFilmStart();
    await this.page.evaluate(
      ({ label, heading, sub, gold, font }) => {
        const narrow = window.innerWidth < 500;
        const el = document.createElement('div');
        el.id = '__demo_card';
        el.style.cssText = [
          'position:fixed', 'inset:0', 'z-index:2147483647',
          'display:flex', 'flex-direction:column', 'align-items:center', 'justify-content:center',
          'gap:14px', 'background:#101014', 'color:#f5f1e8',
          `font-family:${font}`, 'opacity:0', 'transition:opacity 400ms ease',
          'text-align:center', `padding:0 ${narrow ? 28 : 60}px`,
        ].join(';');
        el.innerHTML =
          (label
            ? `<div style="letter-spacing:0.22em;font-size:${narrow ? 11 : 13}px;font-weight:600;color:${gold}">${label}</div>`
            : '') +
          `<div style="font-size:${narrow ? 26 : 40}px;font-weight:700;line-height:1.15;max-width:820px">${heading}</div>` +
          `<div style="font-size:${narrow ? 12 : 15}px;color:#b9b4a8">${sub}</div>`;
        document.documentElement.appendChild(el);
        requestAnimationFrame(() => { el.style.opacity = '1'; });
      },
      { label, heading, sub, gold: GOLD, font: FONT },
    );
    await this.page.waitForTimeout(hold);
    await this.page.evaluate(() => {
      const el = document.getElementById('__demo_card');
      if (!el) return;
      el.style.opacity = '0';
      setTimeout(() => el.remove(), 450);
    });
    await this.page.waitForTimeout(500);
  }

  /**
   * Show a lower-third caption. Replaces the current one; stays up until the
   * next caption() or clear(). Holds for `hold` ms so the line can be read.
   */
  async caption(text: string, hold = 2200): Promise<void> {
    this.markFilmStart();
    await this.page.evaluate(
      ({ text, gold, panel, font }) => {
        let el = document.getElementById('__demo_caption');
        if (!el) {
          // On a phone frame the caption sits above the bottom tab bar and
          // drops a size, or it covers the very controls being demonstrated.
          const narrow = window.innerWidth < 500;
          el = document.createElement('div');
          el.id = '__demo_caption';
          el.style.cssText = [
            'position:fixed', 'left:50%', `bottom:${narrow ? 96 : 36}px`, 'transform:translate(-50%, 12px)',
            `max-width:${narrow ? 88 : 76}%`, `padding:${narrow ? '9px 14px' : '12px 22px'}`, 'border-radius:10px',
            `background:${panel}`, 'color:#f5f1e8', 'backdrop-filter:blur(6px)',
            `border-left:3px solid ${gold}`,
            `font-family:${font}`, `font-size:${narrow ? 15 : 19}px`, 'font-weight:500', 'line-height:1.35',
            'z-index:2147483645', 'opacity:0',
            'transition:opacity 250ms ease, transform 250ms ease',
            'box-shadow:0 8px 28px rgba(0,0,0,0.4)', 'text-align:center',
          ].join(';');
          document.documentElement.appendChild(el);
        }
        el.textContent = text;
        requestAnimationFrame(() => {
          el.style.opacity = '1';
          el.style.transform = 'translate(-50%, 0)';
        });
      },
      { text, gold: GOLD, panel: PANEL, font: FONT },
    );
    await this.page.waitForTimeout(hold);
  }

  async clearCaption(): Promise<void> {
    await this.page.evaluate(() => {
      const el = document.getElementById('__demo_caption');
      if (!el) return;
      el.style.opacity = '0';
      el.style.transform = 'translate(-50%, 12px)';
      setTimeout(() => el.remove(), 300);
    });
    await this.page.waitForTimeout(350);
  }
}

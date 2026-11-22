# Frontend design system

The shared visual and motion vocabulary in `frontend/src/index.css`. It appends to the root `CLAUDE.md` and never overrides it; sections the text names but that are not here (for example "Placeholder credentials are refused" or "Outgoing public URLs") are in `CLAUDE.md`.

## Frontend Design System

Shared visual and motion vocabulary lives in `frontend/src/index.css`. Prefer
these over ad-hoc Tailwind so surfaces stay consistent.

- **Motion tokens** — `--dur-instant/fast/base/slow` and `--ease-out`,
  `--ease-in-out`, `--ease-spring`. A global `prefers-reduced-motion` guard
  collapses every animation and transition.
- **Elevation** — `--shadow-sm/md/lg/xl`, `--shadow-gold`, plus the
  `.shadow-card`, `.shadow-float`, `.shadow-overlay`, `.shadow-gold` utilities.
- **Entrance animations** — `.animate-fade-in`, `.animate-fade-in-up`,
  `.animate-scale-in` (modals), `.animate-sheet-up` (bottom sheets),
  `.animate-slide-in` (drawers), `.animate-pop` (value changes), `.u-stagger`
  (sequenced list children).
- **Interaction utilities** — `.u-lift` (cards that link somewhere), `.u-press`
  (buttons and icon controls), `.u-nudge` (nav and list rows), `.u-sheen`
  (primary CTAs), `.u-hairline`, `.u-tnum`, `.u-text-gold-gradient`.
- **Touch targets** — on `pointer: coarse` every button gets `min-height: 40px`.
  A control whose drawn size *is* the design (a pill switch, a round icon badge
  over an image) must carry `.tap-target`, or that floor stretches the circle
  into an ellipse; the class keeps the box and moves the 40px touch area onto a
  centred pseudo-element. `.no-min-target` opts out with no replacement area.
- **Component classes** — `.btn` + `.btn-primary/secondary/ghost/danger/brass` +
  `.btn-sm/lg`, `.field`, `.surface-card`, `.skeleton`, `.spinner`,
  `.skip-link`, `.app-tab` (mobile bottom-nav dot/pill markers).
- **Loading states** — use `src/components/Skeleton.tsx` (`Skeleton`,
  `SkeletonText`, `SkeletonCard`, `SkeletonList`, `SkeletonTable`,
  `SkeletonStats`, `SkeletonPage`, `Spinner`) or `LoadingRows` from
  `src/components/leagues` inside a `<Section>`. Don't ship a bare "Loading…"
  string — it collapses the layout and reflows when data lands.
- **Layer stack** — nav chrome `z-40`–`z-[60]`, dialogs and overlays `z-[110]`,
  image viewers/editors `z-[120]`, toasts `z-[150]`, `.skip-link` `200`. Toasts
  have to outrank every overlay: most of what they report is the outcome of an
  action *started from inside a dialog*, and a toast under the backdrop is
  blurred out — the user reads a failed submit as a dead button. New overlays
  go at `z-[110]`/`z-[120]`; `Toast.test.tsx` scans the source and fails on
  anything at or above the toast layer.
- **Native-only rules** — `.native-app` selectors in the base layer disable
  long-press callouts, chrome text selection, and overscroll bounce inside the
  Capacitor WebView. Add `.selectable` to opt real content back in.
- **Refreshing** — `Layout` owns the app's only reload affordances: pull down on
  the page scroller (`usePullToRefresh`, touch only) or tap the SUB12 lockup.
  Both refetch active TanStack queries rather than reloading the WebView, which
  would reset the router. Android targets SDK 35, so `frontend/android/app/src/main/
  res/values-v35/styles.xml` opts out of Android 15's forced edge-to-edge — the
  WebView never reports system-bar insets to `env(safe-area-inset-*)`, so the
  app shell would otherwise draw under the status and gesture bars.

- **Scrolling** — the document is the app's only scroller. The shell is
  `min-h-screen`, a floor rather than a height, so `<main>` always grows to its
  content and can never scroll itself. Do not give it (or any full-page wrapper)
  an `overflow` value: that makes it a scroll container which can never scroll,
  and an `overscroll-behavior` of `contain`/`none` on such a dead container
  stops touch gestures inside it chaining out to the document — the page then
  will not scroll at all on a phone. Native pull-to-refresh/bounce is suppressed
  on `body` (which propagates to the viewport) instead.

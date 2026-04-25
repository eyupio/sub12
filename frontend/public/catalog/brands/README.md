# Brand fallback marks

Generic text-based SVG badges shown when a catalog entry has no `image_url`. **These are not brand logos** — they are in-house placeholders containing brand initials only, so they don't derive from trademarked artwork.

Slug rule: lowercase, diacritics stripped, `&` mapped to `-and-`, non-alphanumerics collapsed to `-`. See [`brandImages.ts`](../../../src/catalog/brandImages.ts).

Files:

- `_unknown.svg` — last-resort fallback when a brand mark file is missing (the `<img>` swaps to this on `onError`).
- One SVG per brand using the slug rule (e.g. `air-arms.svg`, `h-and-n.svg`, `weihrauch.svg`).

Style guide: 64×64 viewBox, rounded background `#2a2622`, brass text `#c5a572`. Keep it simple — these render at 32×32 in the UI.

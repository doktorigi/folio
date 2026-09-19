# Contributing to Folio

Thanks for helping! The feature list is the [Roadmap issue](https://github.com/doktorigi/folio/issues?q=is%3Aissue+label%3Aroadmap). If you're new, pick one labeled [`good first issue`](https://github.com/doktorigi/folio/labels/good%20first%20issue).

Comment on an issue before starting so two people don't build the same thing. By taking part you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## Setup

```sh
npm install
npm run dev     # web app at http://localhost:5173
npm test
```

The desktop app (optional) needs [Rust](https://rustup.rs). Run it with `npm run tauri dev`.

## How the code works

It's small on purpose, so read it all. It takes about 15 minutes.

| File | What it does |
|---|---|
| `src/main.js` | The whole UI: loading/rendering (pdf.js), page ops, forms, overlay items, signatures, edit text, OCR (tesseract.js) |
| `src/bake.js` | Burns overlay items into the PDF on save (pdf-lib). Runs in Node too. |
| `test/bake.test.mjs` | Checks edits land where the user put them, on pages at every rotation |
| `public/sw.js`, `public/manifest.webmanifest` | Installable web app (PWA) |
| `scripts/copy-assets.mjs` | Copies pdf.js fonts and the OCR engine and data into `public/` so nothing loads from a CDN |
| `src-tauri/` | Windows desktop wrapper |

**The model:** `doc` (a pdf-lib `PDFDocument`) is the source of truth for pages. Things the user adds (text, images, drawings, rectangles) are plain objects in `pages[i].items`. Their coordinates are in *view units*: the page as displayed, with rotation applied, at zoom 1, y pointing down. They stay editable until **Save**, when `bake()` writes them into the PDF.

## Guidelines

- **Keep it light.** Prefer the browser's built-in features and the libraries we already use (pdf.js, pdf-lib) over new dependencies. If you need a new dependency, explain why in the PR.
- **No servers.** Files must never leave the user's machine.
- **Add a test** when you change logic in `bake.js` or anything with math or parsing. One `node:test` case is enough.
- Keep PRs focused, one feature each, and include a screenshot or GIF for UI changes.
- Match the existing style: small functions, few comments, no build-time frameworks.

## Releases (maintainers)

Bump `version` in `package.json`, then run `git tag vX.Y.Z && git push origin vX.Y.Z`. CI builds the Windows installers and publishes a GitHub Release. The web app redeploys on every push to `main`.

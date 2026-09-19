# Folio

A lightweight, open-source PDF editor and signer. It runs entirely in your browser: files are never uploaded anywhere.

Built on [pdf.js](https://github.com/mozilla/pdf.js) (rendering) and [pdf-lib](https://github.com/Hopding/pdf-lib) (editing). No backend.

## Features

- **View**: open or drag-and-drop a PDF, zoom, see page thumbnails
- **Edit existing text**: click any line to change it. Folio matches the font style, size and colors, and covers the original with the page's own background color.
- **OCR**: recognizes text in scanned pages, so they become searchable, selectable and editable. It runs on your device, and pages are never uploaded.
- **Add content**: text (font, size, color), whiteout, highlight, freehand drawing, and images. Move and resize any of these, and press Delete to remove one.
- **Sign**: draw or type a signature and place it anywhere. The last 5 signatures are remembered locally.
- **Forms**: fill text fields, checkboxes, dropdowns, and radio groups
- **Pages**: rotate, delete, drag to reorder, add blank pages, insert/merge other PDFs, and extract picked pages (Ctrl+click thumbnails) into a new PDF
- **Save**: downloads the PDF with all edits burned in

## Install

**Windows app:** download `Folio_x.y.z_x64-setup.exe` from [Releases](https://github.com/doktorigi/folio/releases/latest) and run it. It doesn't need admin rights and adds a Start menu entry. The installer isn't code-signed yet, so SmartScreen may warn you: click *More info → Run anyway*.

**Or install it from your browser (any OS):**

1. Open **https://doktorigi.github.io/folio/** in Chrome or Edge.
2. Click the install icon in the address bar, or go to menu → *Install Folio*.

After that, Folio gets its own window and a Start menu or Dock entry. It works offline and shows up under *Open with* for PDF files. Updates install themselves the next time it starts while online.

Firefox and Safari can use the same link as a regular web page. In Safari on macOS, *File → Add to Dock* also installs it.

## Develop


```sh
npm install
npm run dev      # http://localhost:5173
npm run build    # static site in dist/, host anywhere (GitHub Pages, etc.)
npm test
npm run tauri dev     # desktop app (needs Rust)
npm run tauri build   # Windows installers in src-tauri/target/release/bundle/
```

Pushing a `v*` tag builds the Windows installers in CI and attaches them to a GitHub Release.

## Contributing

Want to help? See the [Roadmap](https://github.com/doktorigi/folio/issues?q=is%3Aissue+label%3Aroadmap) for the feature list ([good first issues](https://github.com/doktorigi/folio/labels/good%20first%20issue) are a great start) and [CONTRIBUTING.md](CONTRIBUTING.md) for setup and a code tour.

## Limitations (PRs welcome)

- **Whiteout is not redaction.** It covers content but the text underneath is still in the file.
- Editing text covers the old line and writes the new one on top, so the original text is still in the file (like whiteout). Edits use the closest standard font (sans, serif or mono), not the exact original font.
- OCR recognizes English only so far.
- Signatures are images, not certificate-based (PKI) digital signatures.
- Added and edited text only supports Latin characters. Other characters are saved as `?`.
- No undo. Password-protected PDFs aren't supported.
- Rotating a page burns in the edits on that page, so they can no longer be moved or deleted.

## License

MIT

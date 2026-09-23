# Folio

A lightweight, open-source PDF editor and signer. It runs entirely in your browser: files are never uploaded anywhere.

Built on [pdf.js](https://github.com/mozilla/pdf.js) (rendering) and [pdf-lib](https://github.com/Hopding/pdf-lib) (editing). No backend.

## Features

- **View**: open or drag-and-drop a PDF, see page thumbnails, zoom (with fit to width), and jump to any page by typing its number. Light and dark themes follow your system.
- **Select and copy text**: with the Select tool, drag over page text to select it and copy it.
- **Edit existing text**: click any line to change it. Folio matches the font style, size and colors, and covers the original with the page's own background color.
- **OCR**: recognizes text in scanned pages, so they become searchable, selectable and editable. It runs on your device, and pages are never uploaded.
- **Redact**: drag over anything secret. On save the page is rasterized and the covered content is deleted from the file, not just hidden. The rest of the page stays searchable text.
- **Find**: Ctrl+F searches the whole document, highlights every match and steps through them with Enter / Shift+Enter.
- **Comment**: drop sticky notes anywhere. They are saved as real PDF annotations, so other readers see them, and comments already in the file are listed in the side panel.
- **Undo/redo**: Ctrl+Z and Ctrl+Y, across overlay edits, page operations and form fills.
- **Add content**: text (font, size, color), whiteout, highlight, freehand drawing, shapes (rectangle, ellipse, line, arrow, with adjustable line width), and images. Move and resize any of these, and press Delete to remove one.
- **Any language**: added and edited text keeps Cyrillic, Greek, accented and other non-Latin characters. Folio embeds a matching DejaVu font, but only when the text needs it.
- **Sign**: draw or type a signature and place it anywhere. The last 5 signatures are remembered locally.
- **Stamps**: click on ✓ checkmarks and ✗ crosses (handy for forms without real fields), or today's date.
- **Copy and paste**: Ctrl+D duplicates the selected item. Ctrl+C and Ctrl+V copy it to the page you're viewing, which is handy for initialing every page.
- **Forms**: fill text fields, checkboxes, dropdowns, and radio groups
- **Pages**: rotate, delete, drag to reorder, add blank pages, insert/merge other PDFs, and extract a page range such as `1-3, 5, 8-` into a new PDF (Ctrl+click thumbnails to pre-fill it)
- **Images to PDF**: drop or insert photos and scans (JPEG, PNG, WebP…) and each one becomes a page. Drop images on an empty window to start a new PDF from them.
- **Save and print**: downloads the PDF with all edits burned in, or prints it

## Keyboard shortcuts

| Keys | Action |
|---|---|
| Ctrl+O / Ctrl+S / Ctrl+P | Open / Save / Print |
| Ctrl+Z / Ctrl+Y | Undo / Redo |
| Ctrl+F, then Enter / Shift+Enter | Find, next / previous match |
| Ctrl+= / Ctrl+− / Ctrl+0 | Zoom in / out / fit width |
| Ctrl+D, Ctrl+C, Ctrl+V | Duplicate, copy, paste the selected item |
| V, E, T, W, H, D, N | Select, Edit text, Add text, Whiteout, Highlight, Draw, Note |
| Delete, Esc | Delete the selected item, back to Select |

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

- **Whiteout is not redaction.** It covers content but the text underneath is still in the file. Use Redact to actually remove it.
- Redacting a page turns it into an image plus a text layer, so that page loses its vector text and any form fields. A line the box only partly covers is dropped whole.
- Find matches within a line of text, so a phrase that wraps across two lines won't be found, and the highlight box is approximate for proportional fonts.
- Editing text covers the old line and writes the new one on top, so the original text is still in the file (like whiteout). Edits use the closest standard font (sans, serif or mono), not the exact original font.
- OCR recognizes English only so far.
- Signatures are images, not certificate-based (PKI) digital signatures.
- Added text can't use emoji or Chinese, Japanese or Korean characters yet. They are saved as `?`.
- Print sends pages as 150 dpi images. For sharper output, save the PDF and print it from a PDF viewer.
- Undo does not cover typing inside a text box (the box's own undo does). Password-protected PDFs aren't supported.
- Rotating a page burns in the edits on that page, so they can no longer be moved or deleted.

## License

MIT

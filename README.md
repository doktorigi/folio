# Folio

A lightweight, open-source PDF editor and signer. It runs entirely in your browser: files are never uploaded anywhere.

Built on [pdf.js](https://github.com/mozilla/pdf.js) (rendering) and [pdf-lib](https://github.com/Hopding/pdf-lib) (editing). No backend.

## Features

- **View**: open or drag-and-drop a PDF, zoom, see page thumbnails
- **Edit content**: add text (with color and size), whiteout, highlight, freehand drawing, and images. Move and resize any of these, and press Delete to remove one.
- **Sign**: draw or type a signature and place it anywhere. The last 5 signatures are remembered locally.
- **Forms**: fill text fields, checkboxes, dropdowns, and radio groups
- **Pages**: rotate, delete, drag to reorder, add blank pages, insert/merge other PDFs, and extract picked pages (Ctrl+click thumbnails) into a new PDF
- **Save**: downloads the PDF with all edits burned in

## Install

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
```

## Limitations (PRs welcome)

- **Whiteout is not redaction.** It covers content but the text underneath is still in the file.
- You can't edit existing text in place. Use whiteout and then add new text.
- Signatures are images, not certificate-based (PKI) digital signatures.
- Added text uses Helvetica, which only covers Latin characters. Other characters are saved as `?`.
- No undo. Password-protected PDFs aren't supported.
- Rotating a page burns in the edits on that page, so they can no longer be moved or deleted.

## License

MIT

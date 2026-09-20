// Burns overlay items into the PDF. Pure pdf-lib, so it runs in Node too (see test/).
// Item coords are "view units": the page as displayed (rotation applied) at zoom 1, y down.
import {
  PDFDocument, PDFString, StandardFonts, LineCapStyle, TextRenderingMode, rgb,
  pushGraphicsState, popGraphicsState, concatTransformationMatrix, setTextRenderingMode, setCharacterSqueeze,
} from 'pdf-lib'

// Standard PDF fonts we can write with, the CSS stack that looks like each on screen, and where the
// baseline sits inside a 1.2 line-height box (as a fraction of font size) for that CSS font.
const sans = { css: 'Helvetica, Arial, sans-serif', base: 0.95 }
const serif = { css: '"Times New Roman", Times, serif', base: 0.94 }
const mono = { css: '"Courier New", Courier, monospace', base: 0.87 }
export const FONTS = {
  [StandardFonts.Helvetica]: sans, [StandardFonts.HelveticaBold]: { ...sans, bold: true },
  [StandardFonts.TimesRoman]: serif, [StandardFonts.TimesRomanBold]: { ...serif, bold: true },
  [StandardFonts.Courier]: mono, [StandardFonts.CourierBold]: { ...mono, bold: true },
}

// Displayed size of a page + matrix mapping local coords (view units, y up) to PDF user space.
export function viewBox(page) {
  const { x, y, width: w, height: h } = page.getCropBox()
  const r = ((page.getRotation().angle % 360) + 360) % 360
  const M = { 0: [1, 0, 0, 1, x, y], 90: [0, 1, -1, 0, x + w, y], 180: [-1, 0, 0, -1, x + w, y + h], 270: [0, -1, 1, 0, x, y + h] }[r]
  return r % 180 ? { w: h, h: w, M } : { w, h, M }
}

// View units (y up, rotation applied) -> PDF user space, for things that ignore the content matrix (annotations).
const toUser = (M, x, y) => [M[0] * x + M[2] * y + M[4], M[1] * x + M[3] * y + M[5]]

const hex = (c = '#000000') => rgb(...[1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16) / 255))

// Wrap existing content in q/Q so a page that leaves the graphics state dirty can't skew our drawing.
function isolate(page) {
  const ctx = page.doc.context
  page.node.normalize()
  page.node.wrapContentStreams(
    ctx.register(ctx.contentStream([pushGraphicsState()])),
    ctx.register(ctx.contentStream([popGraphicsState()])),
  )
}

const fonts = new WeakMap() // doc -> Map(name -> embedded font)
async function getFont(doc, name) {
  if (!fonts.has(doc)) fonts.set(doc, new Map())
  const m = fonts.get(doc)
  if (!m.has(name)) m.set(name, await doc.embedFont(name))
  return m.get(name)
}
// ponytail: standard fonts are WinAnsi only, other chars become '?'. Embed a TTF via @pdf-lib/fontkit for full Unicode.
function clean(font, s) {
  const set = new Set(font.getCharacterSet())
  return [...s].map(ch => (set.has(ch.codePointAt(0)) ? ch : '?')).join('')
}

// Writes invisible text (OCR results) onto page i of doc so it becomes searchable, selectable and editable.
// lines: [{ text, x, y, size, w }] in view units, y = baseline. Each line is squeezed to span exactly w.
export async function addTextLayer(doc, i, lines) {
  const page = doc.getPage(i), font = await getFont(doc, StandardFonts.Helvetica)
  const { h: H, M } = viewBox(page)
  isolate(page)
  page.pushOperators(pushGraphicsState(), concatTransformationMatrix(...M), setTextRenderingMode(TextRenderingMode.Invisible))
  for (const l of lines) {
    const text = clean(font, l.text.trim()), natural = font.widthOfTextAtSize(text, l.size)
    if (!text || !natural) continue
    page.pushOperators(setCharacterSqueeze((100 * l.w) / natural))
    page.drawText(text, { x: l.x, y: H - l.y, size: l.size, font })
  }
  page.pushOperators(popGraphicsState())
}

export async function bake(bytes, pages) {
  const doc = await PDFDocument.load(bytes)
  const images = new Map()

  for (const [i, { items }] of pages.entries()) {
    if (!items.length) continue
    const page = doc.getPage(i)
    const { h: H, M } = viewBox(page)
    isolate(page)
    page.pushOperators(pushGraphicsState(), concatTransformationMatrix(...M))
    for (const it of items) {
      if (it.type === 'rect' || it.type === 'redact') {
        // 'redact' normally never gets here: main.js rasterizes those pages first so the content is really gone.
        page.drawRectangle({ x: it.x, y: H - it.y - it.h, width: it.w, height: it.h, color: hex(it.color), opacity: it.opacity })
      } else if (it.type === 'image') {
        if (!images.has(it.src)) images.set(it.src, await doc.embedPng(it.src))
        page.drawImage(images.get(it.src), { x: it.x, y: H - it.y - it.h, width: it.w, height: it.h })
      } else if (it.type === 'text') {
        const name = it.font ?? StandardFonts.Helvetica, font = await getFont(doc, name)
        it.text.split('\n').forEach((line, n) =>
          page.drawText(clean(font, line), { x: it.x, y: H - it.y - (n * 1.2 + FONTS[name].base) * it.size, size: it.size, font, color: hex(it.color) }))
      } else if (it.type === 'note') {
        // A real PDF sticky note, so other readers see the comment. ponytail: no /AP, viewers draw their own icon.
        const [x0, y0] = toUser(M, it.x, H - it.y - it.h), [x1, y1] = toUser(M, it.x + it.w, H - it.y)
        page.node.addAnnot(doc.context.register(doc.context.obj({
          Type: 'Annot', Subtype: 'Text', Name: 'Comment', Open: false, C: [1, 0.85, 0.3],
          Rect: [Math.min(x0, x1), Math.min(y0, y1), Math.max(x0, x1), Math.max(y0, y1)],
          T: PDFString.of(it.who || 'Folio'), Contents: PDFString.of(it.text),
        })))
      } else if (it.type === 'ink') {
        const pts = it.points.map(([px, py]) => ({ x: it.x + px * it.w / it.ow, y: H - it.y - py * it.h / it.oh }))
        if (pts.length === 1) pts.push(pts[0])
        for (let k = 1; k < pts.length; k++)
          page.drawLine({ start: pts[k - 1], end: pts[k], thickness: it.width, color: hex(it.color), lineCap: LineCapStyle.Round })
      }
    }
    page.pushOperators(popGraphicsState())
  }
  return doc.save()
}

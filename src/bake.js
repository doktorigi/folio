// Burns overlay items into the PDF. Pure pdf-lib, so it runs in Node too (see test/).
// Item coords are "view units": the page as displayed (rotation applied) at zoom 1, y down.
import {
  PDFDocument, StandardFonts, LineCapStyle, rgb,
  pushGraphicsState, popGraphicsState, concatTransformationMatrix,
} from 'pdf-lib'

// Displayed size of a page + matrix mapping local coords (view units, y up) to PDF user space.
export function viewBox(page) {
  const { x, y, width: w, height: h } = page.getCropBox()
  const r = ((page.getRotation().angle % 360) + 360) % 360
  const M = { 0: [1, 0, 0, 1, x, y], 90: [0, 1, -1, 0, x + w, y], 180: [-1, 0, 0, -1, x + w, y + h], 270: [0, -1, 1, 0, x, y + h] }[r]
  return r % 180 ? { w: h, h: w, M } : { w, h, M }
}

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

export async function bake(bytes, pages) {
  const doc = await PDFDocument.load(bytes)
  const font = await doc.embedFont(StandardFonts.Helvetica)
  // ponytail: Helvetica is WinAnsi only, other chars become '?'. Embed a TTF via @pdf-lib/fontkit for full Unicode.
  const charset = new Set(font.getCharacterSet())
  const clean = s => [...s].map(ch => (charset.has(ch.codePointAt(0)) ? ch : '?')).join('')
  const images = new Map()

  for (const [i, { items }] of pages.entries()) {
    if (!items.length) continue
    const page = doc.getPage(i)
    const { h: H, M } = viewBox(page)
    isolate(page)
    page.pushOperators(pushGraphicsState(), concatTransformationMatrix(...M))
    for (const it of items) {
      if (it.type === 'rect') {
        page.drawRectangle({ x: it.x, y: H - it.y - it.h, width: it.w, height: it.h, color: hex(it.color), opacity: it.opacity })
      } else if (it.type === 'image') {
        if (!images.has(it.src)) images.set(it.src, await doc.embedPng(it.src))
        page.drawImage(images.get(it.src), { x: it.x, y: H - it.y - it.h, width: it.w, height: it.h })
      } else if (it.type === 'text') {
        // 0.95em = Helvetica/Arial baseline inside a 1.2 line-height box, matching the on-screen editor.
        it.text.split('\n').forEach((line, n) =>
          page.drawText(clean(line), { x: it.x, y: H - it.y - (n * 1.2 + 0.95) * it.size, size: it.size, font, color: hex(it.color) }))
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

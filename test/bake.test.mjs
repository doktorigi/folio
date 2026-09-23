// node --test : bakes text onto pages at every rotation and checks pdf.js sees it where the editor put it.
import test from 'node:test'
import assert from 'node:assert/strict'
import { PDFDocument, degrees } from 'pdf-lib'
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { readFile } from 'node:fs/promises'
import { StandardFonts } from 'pdf-lib'
import { bake, viewBox, addTextLayer, FONTS, arrowHead, ends } from '../src/bake.js'
import { parseRange } from '../src/range.js'

test('overlay lands at the same view position for every rotation', async () => {
  const src = await PDFDocument.create()
  for (const r of [0, 90, 180, 270]) {
    const p = src.addPage([300, 500])
    p.setCropBox(10, 20, 280, 460) // non-zero origin too
    p.setRotation(degrees(r))
  }
  const pages = [0, 1, 2, 3].map(() => ({ items: [{ type: 'text', x: 40, y: 60, size: 20, color: '#ff0000', text: 'Hi' }] }))
  const out = await bake(await src.save(), pages)

  const pdf = await getDocument({ data: out.slice() }).promise
  for (let i = 0; i < 4; i++) {
    const page = await pdf.getPage(i + 1)
    const vp = page.getViewport({ scale: 1 })
    const { w, h } = viewBox((await PDFDocument.load(out)).getPage(i))
    assert.deepEqual([Math.round(vp.width), Math.round(vp.height)], [w, h])
    const [item] = (await page.getTextContent()).items
    assert.equal(item.str, 'Hi')
    const [vx, vy] = vp.convertToViewportPoint(item.transform[4], item.transform[5])
    assert.ok(Math.abs(vx - 40) < 0.5 && Math.abs(vy - (60 + 0.95 * 20)) < 0.5, `page ${i}: baseline at ${vx},${vy}`)
  }
})

test('pages can be moved within a document', async () => {
  const doc = await PDFDocument.create()
  ;[100, 200, 300].forEach(w => doc.addPage([w, 100]))
  const p = doc.getPage(0)
  doc.removePage(0)
  doc.insertPage(2, p)
  const again = await PDFDocument.load(await doc.save())
  assert.deepEqual(again.getPages().map(p => p.getWidth()), [200, 300, 100])
})

test('each font puts its baseline where the on-screen editor does', async () => {
  const src = await PDFDocument.create()
  src.addPage([400, 400])
  const names = Object.keys(FONTS)
  const items = names.map((font, k) => ({ type: 'text', x: 20, y: 20 + k * 40, size: 20, color: '#000000', text: 'Ag', font }))
  const pdf = await getDocument({ data: await bake(await src.save(), [{ items }]) }).promise
  const page = await pdf.getPage(1), vp = page.getViewport({ scale: 1 })
  const got = (await page.getTextContent()).items.filter(t => t.str).map(t => vp.convertToViewportPoint(t.transform[4], t.transform[5])[1])
  assert.deepEqual(got.map(Math.round), names.map((n, k) => Math.round(20 + k * 40 + FONTS[n].base * 20)))
})

test('OCR text layer is invisible, positioned and sized to the scanned line', async () => {
  const doc = await PDFDocument.create()
  for (const r of [0, 90]) doc.addPage([300, 500]).setRotation(degrees(r))
  for (const i of [0, 1]) await addTextLayer(doc, i, [{ text: 'Scanned line', x: 30, y: 80, size: 12, w: 150 }])
  const pdf = await getDocument({ data: await doc.save() }).promise
  for (const i of [1, 2]) {
    const page = await pdf.getPage(i), vp = page.getViewport({ scale: 1 })
    const items = (await page.getTextContent()).items.filter(t => t.str) // pdf.js may split at spaces
    assert.equal(items.map(t => t.str).join(''), 'Scanned line')
    const [first, last] = [items[0], items.at(-1)], [a, b] = last.transform, n = Math.hypot(a, b)
    const [x0, y0] = vp.convertToViewportPoint(first.transform[4], first.transform[5])
    const [x1, y1] = vp.convertToViewportPoint(last.transform[4] + (a / n) * last.width, last.transform[5] + (b / n) * last.width)
    assert.ok(Math.abs(x0 - 30) < 0.5 && Math.abs(y0 - 80) < 0.5, `page ${i}: starts at ${x0},${y0}`)
    assert.ok(Math.abs(x1 - 180) < 1 && Math.abs(y1 - 80) < 0.5, `page ${i}: ends at ${x1},${y1}`)
    const ops = await page.getOperatorList()
    const k = ops.fnArray.indexOf(OPS.setTextRenderingMode)
    assert.equal(ops.argsArray[k][0], 3) // invisible
  }
})

test('a note bakes into a real sticky-note annotation at the right spot on every rotation', async () => {
  const src = await PDFDocument.create()
  for (const r of [0, 90, 180, 270]) {
    const p = src.addPage([300, 500])
    p.setCropBox(10, 20, 280, 460)
    p.setRotation(degrees(r))
  }
  const items = [{ type: 'note', x: 40, y: 60, w: 22, h: 22, text: 'Check this figure' }]
  const pdf = await getDocument({ data: await bake(await src.save(), [0, 1, 2, 3].map(() => ({ items }))) }).promise
  for (let i = 0; i < 4; i++) {
    const page = await pdf.getPage(i + 1), vp = page.getViewport({ scale: 1 })
    const [a] = await page.getAnnotations()
    assert.equal(a.subtype, 'Text')
    assert.equal(a.contentsObj.str, 'Check this figure')
    // rect is [x0, y0, x1, y1] in user space: its top-left in view units must be where we put it
    const corners = [vp.convertToViewportPoint(a.rect[0], a.rect[1]), vp.convertToViewportPoint(a.rect[2], a.rect[3])]
    const [x, y] = [Math.min(corners[0][0], corners[1][0]), Math.min(corners[0][1], corners[1][1])]
    assert.ok(Math.abs(x - 40) < 0.5 && Math.abs(y - 60) < 0.5, `page ${i}: note at ${x},${y}`)
  }
})

test('page ranges parse to 0-based indices and reject bad input', () => {
  assert.deepEqual(parseRange('1-3, 5, 8-', 9), [0, 1, 2, 4, 7, 8])
  assert.deepEqual(parseRange(' -2 ,2', 4), [0, 1, 1])
  assert.deepEqual(parseRange('', 4), [])
  for (const bad of ['0', '5', '3-2', 'a', '1 2', '-']) assert.throws(() => parseRange(bad, 4), bad)
})

test('text the standard fonts lack is saved with an embedded Unicode font', async () => {
  const src = await PDFDocument.create()
  src.addPage([400, 200])
  const text = 'Привет, Ωmega café'
  const load = f => readFile('node_modules/dejavu-fonts-ttf/ttf/' + f)
  const items = [{ type: 'text', x: 20, y: 20, size: 20, color: '#000000', text, font: StandardFonts.TimesRomanBold }]
  const page = await (await getDocument({ data: await bake(await src.save(), [{ items }], load) }).promise).getPage(1)
  assert.equal((await page.getTextContent()).items.map(t => t.str).join(''), text)
  // without a font loader it still saves, with '?' for what Times can't draw
  const plain = await (await getDocument({ data: await bake(await src.save(), [{ items }]) }).promise).getPage(1)
  assert.equal((await plain.getTextContent()).items.map(t => t.str).join(''), '??????, ?mega café')
})

test('shapes bake as strokes inside their box, arrows pointing the way they were drawn', async () => {
  const src = await PDFDocument.create()
  for (const r of [0, 90]) src.addPage([300, 500]).setRotation(degrees(r))
  const items = [
    { type: 'shape', kind: 'rect', x: 10, y: 10, w: 50, h: 30, a: [0, 0], b: [1, 1], color: '#ff0000', width: 2 },
    { type: 'shape', kind: 'ellipse', x: 80, y: 10, w: 40, h: 40, a: [0, 0], b: [1, 1], color: '#00ff00', width: 3 },
    { type: 'shape', kind: 'arrow', x: 20, y: 100, w: 100, h: 0, a: [1, 0], b: [0, 0], color: '#0000ff', width: 2 },
  ]
  const pdf = await getDocument({ data: await bake(await src.save(), [{ items }, { items }]) }).promise
  for (const n of [1, 2]) {
    const ops = await (await pdf.getPage(n)).getOperatorList()
    // pdf.js folds each path into constructPath, whose first arg is the paint op
    const paints = ops.fnArray.flatMap((f, k) => (f === OPS.constructPath ? [ops.argsArray[k][0]] : []))
    assert.deepEqual(paints, Array(5).fill(OPS.stroke), `page ${n}: rect + ellipse + 3 arrow lines, all outlines`)
  }
  // right-to-left arrow: the head is at the left end, barbs trail to the right
  const [[ax], [bx]] = ends(items[2])
  assert.deepEqual([ax, bx], [120, 20])
  for (const [px] of arrowHead([ax, 100], [bx, 100], 2)) assert.ok(px > bx)
})

test('checkmark and cross stamps bake as strokes spanning their box', async () => {
  const src = await PDFDocument.create()
  src.addPage([200, 200])
  const items = ['check', 'cross'].map((kind, k) => ({ type: 'shape', kind, x: 20 + k * 50, y: 20, w: 20, h: 20, a: [0, 0], b: [1, 1], color: '#000000', width: 2 }))
  const ops = await (await (await getDocument({ data: await bake(await src.save(), [{ items }]) }).promise).getPage(1)).getOperatorList()
  const paths = ops.fnArray.flatMap((f, k) => (f === OPS.constructPath ? [ops.argsArray[k]] : []))
  assert.equal(paths.length, 4) // check: 2 segments, cross: 2 lines
  assert.ok(paths.every(p => p[0] === OPS.stroke))
})

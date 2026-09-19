// node --test : bakes text onto pages at every rotation and checks pdf.js sees it where the editor put it.
import test from 'node:test'
import assert from 'node:assert/strict'
import { PDFDocument, degrees } from 'pdf-lib'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { bake, viewBox } from '../src/bake.js'

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

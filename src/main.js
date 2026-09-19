import * as pdfjs from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { PDFDocument, StandardFonts, degrees, PDFTextField, PDFCheckBox, PDFDropdown, PDFOptionList, PDFRadioGroup } from 'pdf-lib'
import { bake, viewBox, addTextLayer, FONTS } from './bake.js'

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

const $ = id => document.getElementById(id)
const el = (tag, props = {}) => Object.assign(document.createElement(tag), props)
// Installed web app: register offline cache, and open PDFs sent via "Open with" (manifest file_handlers).
// Not in the desktop app: its files are already local, and WebView2 can't update a service worker there.
if (import.meta.env.PROD && 'serviceWorker' in navigator && !window.__TAURI_INTERNALS__) navigator.serviceWorker.register('sw.js')
window.launchQueue?.setConsumer(async ({ files }) => {
  if (!files.length) return
  const f = await files[0].getFile()
  await open(await f.arrayBuffer(), f.name)
})
addEventListener('unhandledrejection', e => alert(e.reason?.message ?? e.reason))

// doc (pdf-lib) is the source of truth for pages; overlay items live in pages[i].items until Save bakes them in.
let doc = null, pdf = null, pages = [], zoom = 1.25, tool = 'select', stamp = null, sel = null, name = 'document.pdf'
const picked = new Set()
const status = msg => ($('status').textContent = msg)

// ---------- loading & rendering ----------
async function open(bytes, fileName) {
  const d = await PDFDocument.load(bytes, { ignoreEncryption: true })
  if (d.isEncrypted) return alert('Password-protected PDFs are not supported yet.')
  doc = d
  name = fileName
  status('')
  pages = doc.getPages().map(() => ({ items: [] }))
  picked.clear()
  await refresh()
}

async function refresh(forms = true) {
  const base = import.meta.env.BASE_URL + 'pdfjs/'
  pdf = await pdfjs.getDocument({ data: await doc.save(), cMapUrl: base + 'cmaps/', standardFontDataUrl: base + 'standard_fonts/' }).promise
  build()
  if (forms) buildForms()
}

const observer = new IntersectionObserver(entries => entries.forEach(e => {
  if (!e.isIntersecting) return
  observer.unobserve(e.target)
  paint(e.target.querySelector('canvas'), +e.target.dataset.i, e.target.clientWidth)
}), { rootMargin: '400px' })

async function paint(canvas, i, cssWidth) {
  const page = await pdf.getPage(i + 1)
  const base = page.getViewport({ scale: 1 })
  const viewport = page.getViewport({ scale: (cssWidth / base.width) * devicePixelRatio })
  Object.assign(canvas, { width: viewport.width, height: viewport.height })
  await page.render({ canvas, viewport }).promise
  canvas.dataset.painted = 1
}

function build() {
  const top = $('viewer').scrollTop
  $('viewer').replaceChildren()
  $('thumbs').replaceChildren()
  observer.disconnect()
  sel = null
  pages.forEach((p, i) => {
    const { w, h } = viewBox(doc.getPage(i))
    const page = el('div', { className: 'page' })
    page.dataset.i = i
    page.style.width = w * zoom + 'px'
    page.style.height = h * zoom + 'px'
    const layer = el('div', { className: 'layer' })
    layer.onpointerdown = e => e.target === layer && startTool(e, i, layer)
    page.append(el('canvas'), layer)
    $('viewer').append(page)
    p.items.forEach(it => drawItem(i, it))
    observer.observe(page)

    const t = el('div', { className: 'thumb' + (picked.has(i) ? ' picked' : ''), draggable: true, title: 'Click: go to page · Ctrl+click: pick for Extract · Drag: reorder' })
    t.dataset.i = i
    const rot = el('button', { textContent: '⟳', title: 'Rotate' })
    const del = el('button', { textContent: '✕', title: 'Delete page' })
    rot.onclick = e => (e.stopPropagation(), rotatePage(i))
    del.onclick = e => (e.stopPropagation(), deletePage(i))
    t.append(el('canvas'), el('div', { textContent: i + 1 + ' ' }))
    t.firstChild.style.aspectRatio = `${w} / ${h}` // reserve space before paint
    t.lastChild.append(rot, del)
    t.onclick = e => {
      if (!(e.ctrlKey || e.metaKey)) return page.scrollIntoView({ behavior: 'smooth' })
      picked.has(i) ? picked.delete(i) : picked.add(i)
      t.classList.toggle('picked')
    }
    t.ondragstart = e => e.dataTransfer.setData('text/plain', i)
    t.ondragover = e => e.preventDefault()
    t.ondrop = e => (e.preventDefault(), movePage(+e.dataTransfer.getData('text/plain'), i))
    $('thumbs').append(t)
    observer.observe(t)
  })
  $('viewer').scrollTop = top
}

// ---------- page operations ----------
async function bakeInto(which) {
  // Burns items of the listed pages into doc (needed before rotating so they turn with the page).
  const only = pages.map((p, i) => (which.includes(i) ? p : { items: [] }))
  doc = await PDFDocument.load(await bake(await doc.save(), only))
  which.forEach(i => (pages[i].items = []))
}

async function rotatePage(i) {
  if (pages[i].items.length) await bakeInto([i])
  const p = doc.getPage(i)
  p.setRotation(degrees((p.getRotation().angle + 90) % 360))
  await refresh() // doc may be a new object after bakeInto, so rebind form fields
}

async function deletePage(i) {
  if (pages.length === 1) return alert("Can't delete the only page.")
  doc.removePage(i)
  pages.splice(i, 1)
  picked.clear()
  await refresh()
}

async function movePage(from, to) {
  if (from === to) return
  const p = doc.getPage(from)
  doc.removePage(from)
  doc.insertPage(to, p)
  pages.splice(to, 0, ...pages.splice(from, 1))
  picked.clear()
  await refresh(false)
}

async function insertPdfs(files) {
  for (const f of files) {
    const other = await PDFDocument.load(await f.arrayBuffer())
    if (!doc) { await open(await f.arrayBuffer(), f.name); continue }
    for (const p of await doc.copyPages(other, other.getPageIndices())) {
      doc.addPage(p)
      pages.push({ items: [] })
    }
  }
  await refresh()
}

function download(bytes, fileName) {
  const a = el('a', { href: URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' })), download: fileName })
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

$('open').onclick = () => $('file').click()
$('file').onchange = async e => { const f = e.target.files[0]; e.target.value = ''; if (f) await open(await f.arrayBuffer(), f.name) }
$('merge').onclick = () => $('mergeFile').click()
$('mergeFile').onchange = async e => { const fs = [...e.target.files]; e.target.value = ''; await insertPdfs(fs) }
$('blank').onclick = async () => {
  if (!doc) { doc = await PDFDocument.create(); pages = [] }
  const last = doc.getPageCount() && doc.getPage(doc.getPageCount() - 1)
  doc.addPage(last ? [last.getWidth(), last.getHeight()] : [612, 792])
  pages.push({ items: [] })
  await refresh()
  $('viewer').lastChild.scrollIntoView()
}
$('save').onclick = async () => doc && download(await bake(await doc.save(), pages), name)
$('extract').onclick = async () => {
  if (!doc) return
  if (!picked.size) return alert('Ctrl+click page thumbnails to pick the pages to extract.')
  const src = await PDFDocument.load(await bake(await doc.save(), pages))
  const out = await PDFDocument.create()
  for (const p of await out.copyPages(src, [...picked].sort((a, b) => a - b))) out.addPage(p)
  download(await out.save(), name.replace(/\.pdf$/i, '') + '-extract.pdf')
}
addEventListener('dragover', e => e.preventDefault())
addEventListener('drop', async e => {
  const files = [...e.dataTransfer.files].filter(f => f.type === 'application/pdf')
  if (!files.length) return
  e.preventDefault()
  await (doc ? insertPdfs(files) : open(await files[0].arrayBuffer(), files[0].name))
})

// ---------- forms ----------
function buildForms() {
  const box = $('forms')
  box.replaceChildren(el('h3', { textContent: 'Form fields' }))
  let fields = []
  try { fields = doc.getForm().getFields() } catch { /* malformed AcroForm: just show no fields */ }
  const commit = fn => async () => { fn(); await refresh(false) }
  for (const f of fields) {
    let input
    if (f instanceof PDFTextField) {
      input = el('input', { value: f.getText() ?? '' })
      input.onchange = commit(() => f.setText(input.value))
    } else if (f instanceof PDFCheckBox) {
      input = el('input', { type: 'checkbox', checked: f.isChecked() })
      input.onchange = commit(() => (input.checked ? f.check() : f.uncheck()))
    } else if (f instanceof PDFDropdown || f instanceof PDFOptionList || f instanceof PDFRadioGroup) {
      input = el('select')
      input.append(el('option'), ...f.getOptions().map(o => el('option', { value: o, textContent: o })))
      input.value = [f.getSelected()].flat()[0] ?? ''
      input.onchange = commit(() => input.value && f.select(input.value))
    } else continue
    input.disabled = f.isReadOnly()
    const label = el('label', { textContent: f.getName() })
    label.append(input)
    box.append(label)
  }
  box.hidden = box.children.length === 1
}

// ---------- overlay items ----------
function place(node, it) {
  node.style.left = it.x * zoom + 'px'
  node.style.top = it.y * zoom + 'px'
  if (it.type !== 'text') {
    node.style.width = it.w * zoom + 'px'
    node.style.height = it.h * zoom + 'px'
  }
}

function drag(e, onMove, onUp) {
  const [x0, y0] = [e.clientX, e.clientY]
  const move = ev => onMove((ev.clientX - x0) / zoom, (ev.clientY - y0) / zoom)
  addEventListener('pointermove', move)
  addEventListener('pointerup', () => { removeEventListener('pointermove', move); onUp?.() }, { once: true })
}

function select(s) {
  sel?.node.classList.remove('sel')
  sel = s
  sel?.node.classList.add('sel')
}

function remove(i, it) {
  pages[i].items = pages[i].items.filter(x => x !== it)
  if (sel?.it === it) sel = null
  it.node?.remove()
}

function drawItem(i, it) {
  const node = el('div', { className: 'item' })
  it.node?.remove()
  Object.defineProperty(it, 'node', { value: node, configurable: true, enumerable: false })
  if (it.type === 'rect') {
    node.style.background = it.color
    node.style.opacity = it.opacity
  } else if (it.type === 'image') {
    node.append(el('img', { src: it.src, draggable: false }))
  } else if (it.type === 'ink') {
    const pts = it.points.map(p => p.join(',')).join(' ')
    node.innerHTML = `<svg viewBox="0 0 ${it.ow} ${it.oh}" preserveAspectRatio="none" style="overflow:visible"><polyline points="${pts}" fill="none" stroke="${it.color}" stroke-width="${it.width * zoom}" vector-effect="non-scaling-stroke" stroke-linecap="round" stroke-linejoin="round"/></svg>`
  } else if (it.type === 'text') {
    const span = el('span', { contentEditable: 'plaintext-only', innerText: it.text })
    const f = FONTS[it.font ?? StandardFonts.Helvetica]
    span.style.fontSize = it.size * zoom + 'px'
    span.style.fontFamily = f.css
    span.style.fontWeight = f.bold ? 'bold' : ''
    span.style.color = it.color
    span.oninput = () => (it.text = span.innerText)
    span.onfocus = () => { select({ i, it, node }); $('font').value = it.font ?? StandardFonts.Helvetica; $('size').value = it.size; $('color').value = it.color }
    span.onblur = () => !it.text.trim() && remove(i, it)
    node.append(span)
  }
  if (it.type !== 'text') node.append(el('div', { className: 'handle' }))
  place(node, it)
  node.onpointerdown = e => {
    if (e.target.tagName === 'SPAN') return
    e.preventDefault()
    select({ i, it, node })
    const [x, y, w, h] = [it.x, it.y, it.w, it.h]
    if (e.target.className === 'handle') {
      const keep = it.type === 'image' ? h / w : 0 // images keep aspect ratio
      drag(e, (dx, dy) => { it.w = Math.max(4, w + dx); it.h = keep ? it.w * keep : Math.max(4, h + dy); place(node, it) })
    } else drag(e, (dx, dy) => { it.x = x + dx; it.y = y + dy; place(node, it) })
  }
  $('viewer').children[i].querySelector('.layer').append(node)
  return node
}

function startTool(e, i, layer) {
  select(null)
  const r = layer.getBoundingClientRect()
  const x = (e.clientX - r.left) / zoom, y = (e.clientY - r.top) / zoom
  const color = $('color').value, add = it => (pages[i].items.push(it), drawItem(i, it))

  if (tool === 'edit') {
    e.preventDefault()
    editTextAt(i, x, y)
  } else if (tool === 'text') {
    const it = { type: 'text', x, y, size: +$('size').value || 14, color, text: '', font: $('font').value }
    e.preventDefault()
    add(it).querySelector('span').focus()
  } else if (tool === 'whiteout' || tool === 'highlight') {
    const it = tool === 'whiteout' ? { type: 'rect', x, y, w: 0, h: 0, color: '#ffffff', opacity: 1 } : { type: 'rect', x, y, w: 0, h: 0, color: '#ffeb3b', opacity: 0.4 }
    add(it)
    drag(e, (dx, dy) => {
      Object.assign(it, { x: Math.min(x, x + dx), y: Math.min(y, y + dy), w: Math.abs(dx), h: Math.abs(dy) })
      place(it.node, it)
    }, () => it.w < 3 && it.h < 3 && remove(i, it))
  } else if (tool === 'draw') {
    const { w, h } = viewBox(doc.getPage(i))
    const it = { type: 'ink', x: 0, y: 0, w, h, ow: w, oh: h, points: [[x, y]], color, width: 2 }
    add(it)
    drag(e, (dx, dy) => { it.points.push([x + dx, y + dy]); drawItem(i, it) }, () => {
      // shrink the page-sized box to the stroke's bounds
      const xs = it.points.map(p => p[0]), ys = it.points.map(p => p[1])
      const [mx, my] = [Math.min(...xs), Math.min(...ys)]
      Object.assign(it, { x: mx, y: my, w: Math.max(1, Math.max(...xs) - mx), h: Math.max(1, Math.max(...ys) - my) })
      Object.assign(it, { ow: it.w, oh: it.h, points: it.points.map(([px, py]) => [px - mx, py - my]) })
      drawItem(i, it)
    })
  } else if (tool === 'stamp' && stamp) {
    const img = new Image()
    img.onload = () => {
      const w = Math.min(stamp.width, img.naturalWidth), h = (w * img.naturalHeight) / img.naturalWidth
      add({ type: 'image', x: x - w / 2, y: y - h / 2, w, h, src: stamp.src })
      setTool('select')
    }
    img.src = stamp.src
  }
}

// ---------- edit existing text ----------
// Groups pdf.js text fragments into lines (view units, y = baseline). ponytail: horizontal left-to-right text only.
async function textLines(i) {
  const page = await pdf.getPage(i + 1), vp = page.getViewport({ scale: 1 })
  const { items, styles } = await page.getTextContent()
  const lines = []
  for (const t of items) {
    if (!t.str) continue
    const [a, b, c, d, e, f] = t.transform, n = Math.hypot(a, b), size = Math.hypot(c, d)
    const [x0, y] = vp.convertToViewportPoint(e, f)
    const [x1, y1] = vp.convertToViewportPoint(e + (a / n) * t.width, f + (b / n) * t.width)
    if (Math.abs(y1 - y) > 1 || x1 < x0) continue
    const prev = lines.at(-1)
    if (prev && Math.abs(prev.y - y) < size * 0.2 && Math.abs(prev.size - size) < 1 && x0 > prev.x1 - 1 && x0 - prev.x1 < size) {
      const gap = x0 - prev.x1 > size * 0.15 && !/\s$/.test(prev.text) && !/^\s/.test(t.str)
      prev.text += (gap ? ' ' : '') + t.str
      prev.x1 = x1
    } else lines.push({ text: t.str, x0, x1, y, size, fontName: t.fontName, family: styles[t.fontName]?.fontFamily })
  }
  return { page, lines: lines.filter(l => l.text.trim()) }
}

// Closest standard font to the one used in the PDF.
function matchFont(page, line) {
  const f = page.commonObjs.has(line.fontName) ? page.commonObjs.get(line.fontName) : {}
  const name = f.name ?? '', bold = f.bold || /bold|black|heavy/i.test(name)
  if (/courier|mono|consol/i.test(name) || line.family === 'monospace') return bold ? StandardFonts.CourierBold : StandardFonts.Courier
  if (/times|georgia|garamond|cambria|minion|palatino/i.test(name) || line.family === 'serif') return bold ? StandardFonts.TimesRomanBold : StandardFonts.TimesRoman
  return bold ? StandardFonts.HelveticaBold : StandardFonts.Helvetica
}

// Background = lightest pixel in the box, ink = darkest, read from the rendered page.
// ponytail: assumes dark text on a lighter background.
function sampleColors(i, x, y, w, h) {
  const c = $('viewer').children[i].querySelector('canvas')
  if (!c.dataset.painted) return { bg: '#ffffff', fg: '#000000' }
  const k = c.width / viewBox(doc.getPage(i)).w
  const d = c.getContext('2d', { willReadFrequently: true }).getImageData(x * k, y * k, Math.max(1, w * k), Math.max(1, h * k)).data
  let lo = [0, 0, 0], hi = [255, 255, 255], min = Infinity, max = -1
  for (let p = 0; p < d.length; p += 4) {
    const px = [d[p], d[p + 1], d[p + 2]], L = px[0] * 0.3 + px[1] * 0.59 + px[2] * 0.11
    if (L < min) { min = L; lo = px }
    if (L > max) { max = L; hi = px }
  }
  const hex = px => '#' + px.map(v => v.toString(16).padStart(2, '0')).join('')
  return { bg: hex(hi), fg: hex(lo) }
}

async function editTextAt(i, x, y) {
  const { page, lines } = await textLines(i)
  const l = lines.find(l => x >= l.x0 - 2 && x <= l.x1 + 2 && y >= l.y - l.size && y <= l.y + l.size * 0.3)
  if (!l) return status('No text there. If this is a scanned page, run OCR first.')
  const font = matchFont(page, l), top = l.y - l.size * 1.05, h = l.size * 1.35
  const { bg, fg } = sampleColors(i, l.x0, top, l.x1 - l.x0, h)
  const cover = { type: 'rect', x: l.x0 - 1, y: top, w: l.x1 - l.x0 + 2, h, color: bg, opacity: 1 }
  const text = { type: 'text', x: l.x0, y: l.y - FONTS[font].base * l.size, size: Math.round(l.size * 10) / 10, color: fg, text: l.text.trim(), font }
  pages[i].items.push(cover, text)
  drawItem(i, cover)
  const span = drawItem(i, text).querySelector('span')
  span.focus()
  getSelection().selectAllChildren(span)
  getSelection().collapseToEnd()
  status('Editing text. Click elsewhere when done.')
}

// ---------- OCR ----------
// Runs Tesseract locally on pages that have no text and writes an invisible text layer into the PDF.
async function ocr() {
  if (!doc) return
  const todo = []
  for (let i = 0; i < pages.length; i++) if (!(await textLines(i)).lines.length) todo.push(i)
  if (!todo.length) return status('Every page already has text. OCR is only needed for scans.')
  $('ocr').disabled = true
  status('Loading OCR engine\u2026')
  let n = 0, worker
  try {
    const { createWorker } = await import('tesseract.js')
    const base = new URL(import.meta.env.BASE_URL + 'tesseract/', location.href).href
    worker = await createWorker('eng', 1, {
      workerPath: base + 'worker.min.js', corePath: base + 'core/', langPath: base + 'lang/',
      logger: m => m.status === 'recognizing text' && status(`OCR page ${n}/${todo.length}: ${Math.round(m.progress * 100)}%`),
    })
    const S = 2.5 // ~180 dpi, a good speed/accuracy trade-off
    for (const i of todo) {
      n++
      const page = await pdf.getPage(i + 1), viewport = page.getViewport({ scale: S })
      const canvas = el('canvas', { width: viewport.width, height: viewport.height })
      await page.render({ canvas, viewport }).promise
      const { data } = await worker.recognize(canvas, {}, { blocks: true })
      const lines = (data.blocks ?? []).flatMap(b => b.paragraphs).flatMap(p => p.lines).map(l => ({
        text: l.text,
        x: l.bbox.x0 / S,
        w: (l.bbox.x1 - l.bbox.x0) / S,
        y: (l.baseline?.has_baseline ? l.baseline.y0 : l.bbox.y1) / S,
        size: ((l.rowAttributes?.rowHeight ?? l.bbox.y1 - l.bbox.y0) * 1.1) / S, // rowHeight is ~0.9em
      }))
      await addTextLayer(doc, i, lines)
    }
  } finally {
    await worker?.terminate()
    $('ocr').disabled = false
  }
  await refresh(false)
  status(`OCR done on ${todo.length} page(s). Text is now searchable, selectable and editable with Edit text.`)
}
$('ocr').onclick = ocr

function setTool(t) {
  tool = t
  document.body.className = 'tool-' + t
  document.querySelectorAll('#tools [data-tool]').forEach(b => b.classList.toggle('on', b.dataset.tool === t))
  status({ stamp: 'Click on a page to place it (Esc to cancel)', edit: 'Click a line of text to edit it' }[t] ?? '')
}
document.querySelectorAll('#tools [data-tool]').forEach(b => (b.onclick = () => setTool(b.dataset.tool)))

const useStamp = (src, width) => { stamp = { src, width }; setTool('stamp'); $('sigDlg').close() }

// Color / size apply to new items and to the selected one.
$('color').oninput = () => { if (sel?.it.type === 'text' || sel?.it.type === 'ink') { sel.it.color = $('color').value; select({ ...sel, node: drawItem(sel.i, sel.it) }) } }
$('size').onchange = () => { if (sel?.it.type === 'text') { sel.it.size = +$('size').value || 14; select({ ...sel, node: drawItem(sel.i, sel.it) }) } }
$('font').onchange = () => { if (sel?.it.type === 'text') { sel.it.font = $('font').value; select({ ...sel, node: drawItem(sel.i, sel.it) }) } }
$('font').replaceChildren(...Object.entries({ Sans: 'Helvetica', 'Sans bold': 'HelveticaBold', Serif: 'TimesRoman', 'Serif bold': 'TimesRomanBold', Mono: 'Courier', 'Mono bold': 'CourierBold' }).map(([label, k]) => el('option', { value: StandardFonts[k], textContent: label })))

addEventListener('keydown', e => {
  if (e.key === 'Escape') { select(null); setTool('select') }
  if ((e.key === 'Delete' || e.key === 'Backspace') && sel && !document.activeElement.isContentEditable && document.activeElement.tagName !== 'INPUT') remove(sel.i, sel.it)
})

$('zoomIn').onclick = () => { zoom = Math.min(zoom * 1.2, 5); doc && build() }
$('zoomOut').onclick = () => { zoom = Math.max(zoom / 1.2, 0.3); doc && build() }

// ---------- images ----------
const toPng = src => new Promise((res, rej) => {
  const img = new Image()
  img.onload = () => {
    const c = el('canvas', { width: img.naturalWidth, height: img.naturalHeight })
    c.getContext('2d').drawImage(img, 0, 0)
    res(c.toDataURL('image/png'))
  }
  img.onerror = () => rej(new Error('Could not read that image.'))
  img.src = src
})
$('image').onclick = () => doc && $('imageFile').click()
$('imageFile').onchange = async e => {
  const f = e.target.files[0]
  e.target.value = ''
  if (!f) return
  const url = URL.createObjectURL(f)
  useStamp(await toPng(url), 200)
  URL.revokeObjectURL(url)
}

// ---------- signatures ----------
const pad = $('pad'), ctx = pad.getContext('2d')
let inked = false
function clearPad() { ctx.clearRect(0, 0, pad.width, pad.height); inked = false }
pad.onpointerdown = e => {
  const r = pad.getBoundingClientRect(), k = pad.width / r.width
  Object.assign(ctx, { lineWidth: 3, lineCap: 'round', lineJoin: 'round', strokeStyle: '#0b1f5c' })
  ctx.beginPath()
  ctx.moveTo((e.clientX - r.left) * k, (e.clientY - r.top) * k)
  const move = ev => { ctx.lineTo((ev.clientX - r.left) * k, (ev.clientY - r.top) * k); ctx.stroke(); inked = true }
  pad.onpointermove = move
  pad.onpointerup = pad.onpointerleave = () => (pad.onpointermove = null)
}

// Crop a canvas to its non-transparent pixels.
function trim(c) {
  const { data, width, height } = c.getContext('2d').getImageData(0, 0, c.width, c.height)
  let [x0, y0, x1, y1] = [width, height, 0, 0]
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (data[(y * width + x) * 4 + 3]) {
    x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y)
  }
  const out = el('canvas', { width: x1 - x0 + 7, height: y1 - y0 + 7 })
  out.getContext('2d').drawImage(c, x0 - 3, y0 - 3, out.width, out.height, 0, 0, out.width, out.height)
  return out.toDataURL('image/png')
}

const savedSigs = () => { try { return JSON.parse(localStorage.getItem('folio.sigs')) ?? [] } catch { return [] } }
function useSig(src) {
  try { localStorage.setItem('folio.sigs', JSON.stringify([src, ...savedSigs().filter(s => s !== src)].slice(0, 5))) } catch { /* storage off: just don't remember */ }
  useStamp(src, 180)
}

$('sign').onclick = () => {
  if (!doc) return
  clearPad()
  $('saved').replaceChildren(...savedSigs().map(src => {
    const img = el('img', { src, title: 'Use this signature (right-click to forget)' })
    img.onclick = () => useSig(src)
    img.oncontextmenu = e => { e.preventDefault(); localStorage.setItem('folio.sigs', JSON.stringify(savedSigs().filter(s => s !== src))); img.remove() }
    return img
  }))
  $('sigDlg').showModal()
}
$('padClear').onclick = clearPad
$('padUse').onclick = () => inked && useSig(trim(pad))
$('typedUse').onclick = () => {
  const text = $('typed').value.trim()
  if (!text) return
  const c = el('canvas', { width: 1200, height: 200 }), g = c.getContext('2d')
  g.font = '72px "Segoe Script", "Brush Script MT", "Snell Roundhand", cursive'
  g.fillStyle = '#0b1f5c'
  g.fillText(text, 10, 130)
  useSig(trim(c))
}
$('sigClose').onclick = () => $('sigDlg').close()

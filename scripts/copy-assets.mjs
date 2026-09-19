// Copies runtime data files from node_modules into public/ so the app works offline and never hits a CDN.
import { cpSync } from 'node:fs'

const copy = (from, to) => cpSync('node_modules/' + from, 'public/' + to, { recursive: true })
copy('pdfjs-dist/cmaps', 'pdfjs/cmaps')
copy('pdfjs-dist/standard_fonts', 'pdfjs/standard_fonts')
copy('tesseract.js/dist/worker.min.js', 'tesseract/worker.min.js')
for (const f of ['tesseract-core-lstm.wasm.js', 'tesseract-core-simd-lstm.wasm.js', 'tesseract-core-relaxedsimd-lstm.wasm.js'])
  copy('tesseract.js-core/' + f, 'tesseract/core/' + f)
copy('@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz', 'tesseract/lang/eng.traineddata.gz')

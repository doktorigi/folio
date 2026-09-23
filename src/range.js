// "1-3, 5, 8-" -> 0-based page indices in the order typed ("8-" runs to the last page, "-3" from the first).
export function parseRange(s, n) {
  const out = []
  for (const part of s.split(',').map(p => p.trim()).filter(Boolean)) {
    const m = part.match(/^(\d*)\s*(-?)\s*(\d*)$/)
    if (!m || (!m[1] && !m[3])) throw new Error(`"${part}" is not a page or range`)
    const a = +(m[1] || 1), b = m[2] ? +(m[3] || n) : a
    if (m[2] === '' && m[3]) throw new Error(`"${part}" is not a page or range`)
    if (a < 1 || b > n || a > b) throw new Error(`"${part}" is outside pages 1-${n}`)
    for (let k = a; k <= b; k++) out.push(k - 1)
  }
  return out
}

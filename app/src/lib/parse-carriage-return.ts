export function parseCarriageReturn(text: string) {
  // Happy path, there are no carriage returns in
  // the text, making this method a noop.
  if (text.indexOf('\r') < 0) {
    return text
  }

  const lines = new Array<string>('')
  const crOrLf = /[\r\n]/gm

  let lineIx = 0
  let columnIx = 0
  let p = 0

  function merge(s: string) {
    const line = lines[lineIx]
    const before = line.substring(0, columnIx)
    const after = line.substring(columnIx + s.length)
    columnIx += s.length
    lines[lineIx] = `${before}${s}${after}`
  }

  let m

  while ((m = crOrLf.exec(text)) !== null) {
    if (m.index > p) {
      merge(text.substring(p, m.index))
    }

    if (m[0] === '\r') {
      columnIx = 0
    } else if (m[0] === '\n') {
      lines[++lineIx] = ''
    }

    p = m.index + 1
  }

  if (p < text.length) {
    merge(text.substring(p))
  }

  return lines.join('\n')
}

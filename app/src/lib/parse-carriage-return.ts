export function parseCarriageReturn(text: string) {
  // Happy path, there are no carriage returns in
  // the text, making this method a noop.
  if (text.indexOf('\r') < 0) {
    return text
  }

  const lines = new Array<string>('')
  const crOrLf = /[\r\n]/gm

  let columnIx = 0
  let p = 0

  function merge(s: string) {
    const line = lines[lines.length - 1]
    const before = line.substring(0, columnIx)
    const after = line.substring(columnIx + s.length)
    columnIx += s.length
    lines[lines.length - 1] = `${before}${s}${after}`
  }

  let m

  while ((m = crOrLf.exec(text)) !== null) {
    if (m.index > p) {
      merge(text.substring(p, m.index))
    }

    if (m[0] === '\r') {
      columnIx = 0
    } else if (m[0] === '\n') {
      lines.push('')
    }

    p = m.index + 1
  }

  if (p < text.length) {
    merge(text.substring(p))
  }

  return lines.join('\n')
}

export function parseCarriageReturn(text: string) {
  // Happy path, there are no carriage returns in
  // the text, making this method a noop.
  if (text.indexOf('\r') < 0) {
    return text
  }

  const lines = new Array<string>('')
  const crOrLf = /[\r\n]/gm

  let columnIx = 0

  function overwrite(s: string) {
    const line = lines[lines.length - 1]
    const before = line.substring(0, columnIx)
    const after = line.substring(columnIx + s.length)
    columnIx += s.length
    lines[lines.length - 1] = `${before}${s}${after}`
  }

  let match
  let pos = 0

  while ((match = crOrLf.exec(text)) !== null) {
    if (match.index > pos) {
      overwrite(text.substring(pos, match.index))
    }

    if (match[0] === '\r') {
      columnIx = 0
    } else if (match[0] === '\n') {
      lines.push('')
    }

    pos = match.index + 1
  }

  if (pos < text.length) {
    overwrite(text.substring(pos))
  }

  return lines.join('\n')
}

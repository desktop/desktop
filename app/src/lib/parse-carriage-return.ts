export function parseCarriageReturn(text: string) {
  // Happy path, there are no carriage returns in
  // the text, making this method a noop.
  if (text.indexOf('\r') < 0) {
    return text
  }

  const lines = new Array<string>('')
  const crLfOrEnd = /(.*?)([\r\n$])/gm

  let columnIx = 0
  let match

  while ((match = crLfOrEnd.exec(text)) !== null) {
    if (match[1].length > 0) {
      const line = lines[lines.length - 1]
      const before = line.substring(0, columnIx)
      const after = line.substring(columnIx + match[1].length)
      columnIx += match[1].length
      lines[lines.length - 1] = `${before}${match[1]}${after}`
    }

    if (match[2] === '\r') {
      columnIx = 0
    } else if (match[2] === '\n') {
      lines.push('')
    }
  }

  return lines.join('\n')
}

type Shell = {
  args: string[]
  quoteCommand: (cmd: string, ...args: string[]) => string
}

// https://github.com/ericcornelissen/shescape/blob/89072ba7de233f81f5553b52098671c94eb9bd0c/src/internal/unix/bash.js#L39
const bashEscape = (arg: string) =>
  arg
    .replace(/[\0\u0008\u001B\u009B]/gu, '')
    .replace(/\r(?!\n)/gu, '')
    .replace(/'/gu, "'\\''")

const shQuoteCommand = (
  escapeFn: (arg: string) => string,
  cmd: string,
  ...args: string[]
) => [cmd, ...args].map(a => `'${escapeFn(a)}'`).join(' ')

export const bash: Shell = {
  args: ['-ilc'],
  quoteCommand: shQuoteCommand.bind(null, bashEscape),
}

// https://github.com/ericcornelissen/shescape/blob/89072ba7de233f81f5553b52098671c94eb9bd0c/src/internal/unix/zsh.js#L37
// At time of writing zsh escapeArgForQuoted was identical to bash's
const zshEscape = bashEscape

export const zsh: Shell = {
  args: ['-ilc'],
  quoteCommand: shQuoteCommand.bind(null, zshEscape),
}

// https://github.com/ericcornelissen/shescape/blob/89072ba7de233f81f5553b52098671c94eb9bd0c/src/internal/win/cmd.js#L35
const cmdEscape = (arg: string) =>
  arg
    .replace(/[\0\u0008\r\u001B\u009B]/gu, '')
    .replace(/\n/gu, ' ')
    .replace(/"/gu, '""')
    .replace(/([%&<>^|])/gu, '"^$1"')
    .replace(/(?<!\\)(\\*)(?="|$)/gu, '$1$1')

export const cmd: Shell = {
  args: ['/d', '/s', '/c'],
  quoteCommand: (cmd, ...args) =>
    `"${[cmd, ...args].map(a => `"${cmdEscape(a)}"`).join(' ')}"`,
}

// https://github.com/ericcornelissen/shescape/blob/89072ba7de233f81f5553b52098671c94eb9bd0c/src/internal/win/powershell.js#L50
const powershellEscape = (arg: string) => {
  arg = arg
    .replace(/[\0\u0008\u001B\u009B]/gu, '')
    .replace(/\r(?!\n)/gu, '')
    .replace(/(['‘’‚‛])/gu, '$1$1')

  if (/[\s\u0085]/u.test(arg)) {
    arg = arg
      .replace(/(?<!\\)(\\*)"/gu, '$1$1""')
      .replace(/(?<!\\)(\\+)$/gu, '$1$1')
  } else {
    arg = arg.replace(/(?<!\\)(\\*)"/gu, '$1$1\\"')
  }

  return arg
}

export const powershell: Shell = {
  args: ['-NonInteractive', '-Command'],
  quoteCommand: (cmd, ...args) =>
    `Start-Process -NoNewWindow -Wait -FilePath '${powershellEscape(cmd)}'${
      args.length > 0
        ? '-ArgumentList ' +
          args.map(a => `'${powershellEscape(a)}'`).join(', ')
        : ''
    }`,
}

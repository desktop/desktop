import * as CodeMirror from 'codemirror'

/** The name of our diff mode. */
const DiffModeName = 'github/diff'

/** The token to be used if no other tokens match. */
const DefaultToken = 'diff-context'

/** Has the diff mode been defined yet? It should happen only once. */
let diffModeDefined = false

const TokenNames: { [key: string]: string | null } = {
  '+': 'diff-add',
  '-': 'diff-delete',
  '@': 'diff-hunk',
}

/** Get the mode for diffs. */
export function getDiffMode(): string {
  if (diffModeDefined) {
    return DiffModeName
  }

  diffModeDefined = true

  CodeMirror.defineMode(DiffModeName, function(config: CodeMirror.EditorConfiguration, modeOptions?: any) {
    return {
      token: parseToken,
    }
  })

  return DiffModeName
}

function parseToken(stream: CodeMirror.StringStream): string {
  const token = TokenNames[stream.peek()] || DefaultToken
  stream.skipToEnd()

  // Use the token to style both the line background and the line content.
  return `line-background-${token} ${token}`
}

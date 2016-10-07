import * as CodeMirror from 'codemirror'

const DiffModeName = 'github/diff'

let diffModeDefined = false

export function getDiffMode(): string {
  if (diffModeDefined) {
    return DiffModeName
  }

  diffModeDefined = true

  CodeMirror.defineMode(DiffModeName, function(config: CodeMirror.EditorConfiguration, modeOptions?: any) {
    const TOKEN_NAMES = {
      '+': 'diff-add',
      '-': 'diff-delete',
      '@': 'diff-hunk',
    }

    return {
      token: function(stream) {
        const token: any = (TOKEN_NAMES as any)[stream.peek()] || 'diff-context'

        stream.skipToEnd()

        // Use the token to style both the line background and the line content.
        return `line-background-${token} ${token}`
      },
    }
  })

  return DiffModeName
}

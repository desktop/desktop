/// <reference path="./globals.d.ts" />

import 'codemirror/addon/runmode/runmode.node.js'

// Our runmode import will have tweaked the requires here so
// that we don't pull in the full CodeMirror
import * as CodeMirror from 'codemirror'

import 'codemirror/mode/javascript/javascript'

interface IToken {
  length: number
  text: string
  token: string
}

onmessage = (ev: MessageEvent) => {
  const tabSize: number = ev.data.tabSize
  const mimeType: string = ev.data.mimeType
  const contents: string = ev.data.contents
  const requestedLines: Array<number> | undefined = ev.data.lines

  const lineFilter =
    requestedLines && requestedLines.length
      ? new Set<number>(requestedLines)
      : null

  const mode: CodeMirror.Mode<{}> = CodeMirror.getMode({ tabSize }, mimeType)

  if (!mode) {
    postMessage({ error: `No mode found for ${mimeType}` })
    return
  }

  const lines = contents.split(/\r?\n/)
  const state: any = mode.startState ? mode.startState() : null

  const tokens: {
    [line: number]: { [startIndex: number]: IToken }
  } = {}

  for (const [ix, line] of lines.entries()) {
    // For stateless modes we can optimize by only running
    // the tokenizer over lines we care about.
    if (lineFilter && !state) {
      if (!lineFilter.has(ix)) {
        continue
      }
    }

    if (!line.length) {
      if (mode.blankLine) {
        mode.blankLine(state)
      }

      continue
    }

    const lineStream = new (CodeMirror as any).StringStream(
      line,
      tabSize
    ) as CodeMirror.StringStream

    while (!lineStream.eol()) {
      const token = mode.token(lineStream, state)

      if (token && (!lineFilter || lineFilter.has(ix))) {
        tokens[ix] = tokens[ix] || {}
        tokens[ix][lineStream.start] = {
          length: lineStream.pos - lineStream.start,
          text: lineStream.current(),
          token,
        }
      }

      lineStream.start = lineStream.pos
    }
  }

  postMessage(tokens)
}

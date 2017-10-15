/// <reference path="./globals.d.ts" />

import 'codemirror/addon/runmode/runmode.node.js'

// Our runmode import will have tweaked the requires here so
// that we don't pull in the full CodeMirror
import * as CodeMirror from 'codemirror'

import 'codemirror/mode/javascript/javascript'
import 'codemirror/mode/jsx/jsx'
import 'codemirror/mode/sass/sass'
import 'codemirror/mode/htmlmixed/htmlmixed'
import 'codemirror/mode/markdown/markdown'

interface IToken {
  length: number
  text: string
  token: string
}

const extensionMIMEMap = new Map<string, string>()

extensionMIMEMap.set('.ts', 'text/typescript')
extensionMIMEMap.set('.tsx', 'text/jsx')
extensionMIMEMap.set('.js', 'text/javascript')
extensionMIMEMap.set('.json', 'application/json')
extensionMIMEMap.set('.html', 'text/html')
extensionMIMEMap.set('.htm', 'text/html')
extensionMIMEMap.set('.markdown', 'text/x-markdown')
extensionMIMEMap.set('.md', 'text/x-markdown')

// onerror = (ev: ErrorEvent) => {
//   close()
// }

onmessage = (ev: MessageEvent) => {
  const tabSize: number = ev.data.tabSize
  const extension: string = ev.data.extension
  const contents: string = ev.data.contents
  const requestedLines: Array<number> | undefined = ev.data.lines

  const mimeType = extensionMIMEMap.get(extension)

  if (!mimeType) {
    postMessage({ error: `Extension not supported: ${extension}` })
    return
  }

  const mode: CodeMirror.Mode<{}> = CodeMirror.getMode({ tabSize }, mimeType)

  if (!mode) {
    postMessage({ error: `No mode found for ${mimeType}` })
    return
  }

  const lineFilter =
    requestedLines && requestedLines.length
      ? new Set<number>(requestedLines)
      : null

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
  close()
}

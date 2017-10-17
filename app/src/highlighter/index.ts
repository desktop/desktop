/// <reference path="./globals.d.ts" />

// This doesn't import all of CodeMirror, instead it only imports
// a small subset. This hack is brought to you by webpack and you
// can read all about it in webpack.common.js.
import * as CodeMirror from 'codemirror'

// This is a hack, some modes (looking at you markdown) uses
// CodeMirror.innerMode which isn't defined in the stripped down
// runmode. Luckily it's a simple, dependency free method so we'll
// just import it and stick it on the global CodeMirror object.
import { innerMode } from 'codemirror/src/modes'
const cm = CodeMirror as any
cm.innerMode = cm.innerMode || innerMode

const extensionMIMEMap = new Map<string, string>()

import 'codemirror/mode/javascript/javascript'

extensionMIMEMap.set('.ts', 'text/typescript')
extensionMIMEMap.set('.js', 'text/javascript')
extensionMIMEMap.set('.json', 'application/json')

import 'codemirror/mode/jsx/jsx'
extensionMIMEMap.set('.tsx', 'text/typescript-jsx')
extensionMIMEMap.set('.jsx', 'text/jsx')

import 'codemirror/mode/htmlmixed/htmlmixed'
extensionMIMEMap.set('.html', 'text/html')
extensionMIMEMap.set('.htm', 'text/html')

import 'codemirror/mode/css/css'
extensionMIMEMap.set('.css', 'text/css')
extensionMIMEMap.set('.scss', 'text/x-scss')
extensionMIMEMap.set('.less', 'text/x-less')

import 'codemirror/mode/sass/sass'
extensionMIMEMap.set('.sass', 'text/x-sass')

import 'codemirror/mode/markdown/markdown'
extensionMIMEMap.set('.markdown', 'text/x-markdown')
extensionMIMEMap.set('.md', 'text/x-markdown')

import 'codemirror/mode/yaml/yaml'
extensionMIMEMap.set('.yaml', 'text/yaml')
extensionMIMEMap.set('.yml', 'text/yaml')

import 'codemirror/mode/xml/xml'
extensionMIMEMap.set('.xml', 'text/xml')
extensionMIMEMap.set('.xaml', 'text/xml')
extensionMIMEMap.set('.csproj', 'text/xml')

import 'codemirror/mode/clike/clike'
extensionMIMEMap.set('.objc', 'text/x-objectivec')
extensionMIMEMap.set('.scala', 'text/x-scala')
extensionMIMEMap.set('.sc', 'text/x-scala')
extensionMIMEMap.set('.cs', 'text/x-csharp')
extensionMIMEMap.set('.java', 'text/x-java')
extensionMIMEMap.set('.c', 'text/x-c')
extensionMIMEMap.set('.h', 'text/x-c')
extensionMIMEMap.set('.cpp', 'text/x-c++src')

import 'codemirror/mode/shell/shell'
extensionMIMEMap.set('.sh', 'text/x-sh')

import 'codemirror/mode/go/go'
extensionMIMEMap.set('.go', 'text/x-go')

import 'codemirror/mode/perl/perl'
extensionMIMEMap.set('.pl', 'text/x-perl')

import 'codemirror/mode/php/php'
extensionMIMEMap.set('.php', 'text/x-php')

import 'codemirror/mode/python/python'
extensionMIMEMap.set('.py', 'text/x-python')

import 'codemirror/mode/ruby/ruby'
extensionMIMEMap.set('.rb', 'text/x-ruby')

interface IToken {
  length: number
  text: string
  token: string
}

type Tokens = {
  [line: number]: { [startIndex: number]: IToken }
}

function guessMimeType(contents: string) {
  if (contents.startsWith('<?xml')) {
    return 'text/xml'
  }

  if (contents.startsWith('#!')) {
    const m = /^#!.*?(ts-node|node|bash|sh|python(?:[\d.]+)?)\r?\n/g.exec(
      contents
    )

    if (m) {
      switch (m[1]) {
        case 'ts-node':
          return 'text/typescript'
        case 'node':
          return 'text/javascript'
        case 'sh':
        case 'bash':
          return 'text/x-sh'
        case 'perl':
          return 'text/x-perl'
      }

      if (m[1].startsWith('python')) {
        return 'text/x-python'
      }
    }
  }

  return null
}

onmessage = (ev: MessageEvent) => {
  const startTime = performance ? performance.now() : null

  const tabSize: number = ev.data.tabSize
  const extension: string = ev.data.extension
  const contents: string = ev.data.contents
  const requestedLines: Array<number> | undefined = ev.data.lines

  const mimeType = extensionMIMEMap.get(extension) || guessMimeType(contents)

  if (!mimeType) {
    console.debug(`Could not determine mime type for highlighting`)
    postMessage({})
    return
  }

  const mode: CodeMirror.Mode<{}> = CodeMirror.getMode({ tabSize }, mimeType)

  if (!mode) {
    console.debug(`Could not find highlighting mode for '${mimeType}'`)
    postMessage({})
    return
  }

  const lineFilter =
    requestedLines && requestedLines.length
      ? new Set<number>(requestedLines)
      : null

  const lines = contents.split(/\r?\n/)
  const state: any = mode.startState ? mode.startState() : null

  const tokens: Tokens = {}

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

    const ctx = { lines, line: ix }

    const lineStream = new (CodeMirror as any).StringStream(
      line,
      tabSize,
      ctx
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

  if (startTime) {
    const endTime = performance.now()
    const duration = endTime - startTime
    console.info('Tokenization done in ' + duration)
  }
  postMessage(tokens)
}

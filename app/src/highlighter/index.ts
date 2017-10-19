/// <reference path="./globals.d.ts" />

// This doesn't import all of CodeMirror, instead it only imports
// a small subset. This hack is brought to you by webpack and you
// can read all about it in webpack.common.js.
import * as CodeMirror from 'codemirror/addon/runmode/runmode.node.js'

// This is a hack, some modes (looking at you markdown) uses
// CodeMirror.innerMode which isn't defined in the stripped down
// runmode. Luckily it's a simple, dependency free method so we'll
// just import it and stick it on the global CodeMirror object.
import { innerMode } from 'codemirror/src/modes'
const cm = CodeMirror as any
cm.innerMode = cm.innerMode || innerMode

import { ITokens, IHighlightRequest } from '../lib/highlighter'

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
  const request = ev.data as IHighlightRequest

  const tabSize = request.tabSize || 4
  const extension = request.extension
  const contents = request.contents

  const mimeType = extensionMIMEMap.get(extension) || guessMimeType(contents)

  if (!mimeType) {
    console.debug(`Could not determine mime type for highlighting`)
    postMessage({})
    return
  }

  const mode = CodeMirror.getMode({}, mimeType)

  if (!mode) {
    console.debug(`Could not find highlighting mode for '${mimeType}'`)
    postMessage({})
    return
  }

  const lineFilter =
    request.lines && request.lines.length
      ? new Set<number>(request.lines)
      : null

  // If we've got a set of requested lines we can keep track of the maximum
  // line we need so that we can bail immediately when we've reached it.
  const maxLine = lineFilter ? Math.max(...lineFilter) : null

  const lines = contents.split(/\r?\n/)
  const state: any = mode.startState ? mode.startState() : null

  const tokens: ITokens = {}

  for (const [ix, line] of lines.entries()) {
    // No need to continue after the max line
    if (maxLine !== null && ix > maxLine) {
      break
    }

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

    const lineStream = new CodeMirror.StringStream(line, tabSize, {
      lines,
      line: ix,
    })

    while (!lineStream.eol()) {
      const token = mode.token(lineStream, state)

      if (token && (!lineFilter || lineFilter.has(ix))) {
        tokens[ix] = tokens[ix] || {}
        tokens[ix][lineStream.start] = {
          length: lineStream.pos - lineStream.start,
          token,
        }
      }

      lineStream.start = lineStream.pos
    }
  }

  postMessage(tokens)
}

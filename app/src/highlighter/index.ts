/// <reference path="./globals.d.ts" />

// This doesn't import all of CodeMirror, instead it only imports
// a small subset. This hack is brought to you by webpack and you
// can read all about it in webpack.common.js.
import {
  getMode,
  innerMode,
  StringStream,
} from 'codemirror/addon/runmode/runmode.node.js'

import { ITokens, IHighlightRequest } from '../lib/highlighter/types'

const extensionMIMEMap = new Map<string, string>()

import 'codemirror/mode/javascript/javascript'
extensionMIMEMap.set('.ts', 'text/typescript')
extensionMIMEMap.set('.js', 'text/javascript')
extensionMIMEMap.set('.json', 'application/json')

import 'codemirror/mode/coffeescript/coffeescript'
extensionMIMEMap.set('.coffee', 'text/x-coffeescript')

import 'codemirror/mode/jsx/jsx'
extensionMIMEMap.set('.tsx', 'text/typescript-jsx')
extensionMIMEMap.set('.jsx', 'text/jsx')

import 'codemirror/mode/htmlmixed/htmlmixed'
extensionMIMEMap.set('.html', 'text/html')
extensionMIMEMap.set('.htm', 'text/html')

import 'codemirror/mode/htmlembedded/htmlembedded'
extensionMIMEMap.set('.jsp', 'application/x-jsp')

import 'codemirror/mode/css/css'
extensionMIMEMap.set('.css', 'text/css')
extensionMIMEMap.set('.scss', 'text/x-scss')
extensionMIMEMap.set('.less', 'text/x-less')

import 'codemirror/mode/vue/vue'
extensionMIMEMap.set('.vue', 'text/x-vue')

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
extensionMIMEMap.set('.fsproj', 'text/xml')
extensionMIMEMap.set('.vcxproj', 'text/xml')
extensionMIMEMap.set('.vbproj', 'text/xml')
extensionMIMEMap.set('.svg', 'text/xml')

import 'codemirror/mode/clike/clike'
extensionMIMEMap.set('.m', 'text/x-objectivec')
extensionMIMEMap.set('.scala', 'text/x-scala')
extensionMIMEMap.set('.sc', 'text/x-scala')
extensionMIMEMap.set('.cs', 'text/x-csharp')
extensionMIMEMap.set('.java', 'text/x-java')
extensionMIMEMap.set('.c', 'text/x-c')
extensionMIMEMap.set('.h', 'text/x-c')
extensionMIMEMap.set('.cpp', 'text/x-c++src')
extensionMIMEMap.set('.hpp', 'text/x-c++src')
extensionMIMEMap.set('.kt', 'text/x-kotlin')

import 'codemirror/mode/mllike/mllike'
extensionMIMEMap.set('.ml', 'text/x-ocaml')
extensionMIMEMap.set('.fs', 'text/x-fsharp')
extensionMIMEMap.set('.fsx', 'text/x-fsharp')
extensionMIMEMap.set('.fsi', 'text/x-fsharp')

import 'codemirror/mode/swift/swift'
extensionMIMEMap.set('.swift', 'text/x-swift')

import 'codemirror/mode/shell/shell'
extensionMIMEMap.set('.sh', 'text/x-sh')

import 'codemirror/mode/sql/sql'
extensionMIMEMap.set('.sql', 'text/x-sql')

import 'codemirror/mode/cypher/cypher'
extensionMIMEMap.set('.cql', 'application/x-cypher-query')

import 'codemirror/mode/go/go'
extensionMIMEMap.set('.go', 'text/x-go')

import 'codemirror/mode/perl/perl'
extensionMIMEMap.set('.pl', 'text/x-perl')

import 'codemirror/mode/php/php'
extensionMIMEMap.set('.php', 'application/x-httpd-php')

import 'codemirror/mode/python/python'
extensionMIMEMap.set('.py', 'text/x-python')

import 'codemirror/mode/ruby/ruby'
extensionMIMEMap.set('.rb', 'text/x-ruby')

import 'codemirror/mode/clojure/clojure'
extensionMIMEMap.set('.clj', 'text/x-clojure')
extensionMIMEMap.set('.cljc', 'text/x-clojure')
extensionMIMEMap.set('.cljs', 'text/x-clojure')
extensionMIMEMap.set('.edn', 'text/x-clojure')

import 'codemirror/mode/rust/rust'
extensionMIMEMap.set('.rs', 'text/x-rustsrc')

import 'codemirror-mode-elixir'
extensionMIMEMap.set('.ex', 'text/x-elixir')
extensionMIMEMap.set('.exs', 'text/x-elixir')

import 'codemirror/mode/haxe/haxe'
extensionMIMEMap.set('.hx', 'text/x-haxe')

import 'codemirror/mode/r/r'
extensionMIMEMap.set('.r', 'text/x-rsrc')

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

function detectMode(request: IHighlightRequest): CodeMirror.Mode<{}> | null {
  const mimeType =
    extensionMIMEMap.get(request.extension.toLowerCase()) ||
    guessMimeType(request.contents)

  if (!mimeType) {
    return null
  }

  return getMode({}, mimeType) || null
}

function getModeName(mode: CodeMirror.Mode<{}>): string | null {
  const name = (mode as any).name
  return name && typeof name === 'string' ? name : null
}

/**
 * Helper method to determine the name of the innermost (i.e. current)
 * mode. Think of this as an abstraction over CodeMirror's innerMode
 * with added type guards.
 */
function getInnerModeName(
  mode: CodeMirror.Mode<{}>,
  state: any
): string | null {
  const inner = innerMode(mode, state)
  return inner && inner.mode ? getModeName(inner.mode) : null
}

/**
 * Extract the next token from the line stream or null if no token
 * could be extracted from the current position in the line stream.
 *
 * This method is more or less equal to the readToken method in
 * CodeMirror but since the readToken class in CodeMirror isn't included
 * in the Node runmode we're not able to use it.
 *
 * Worth noting here is that we're also replicated the workaround for
 * modes that aren't adhering to the rules of never returning without
 * advancing the line stream by trying it again (up to ten times). See
 * https://github.com/codemirror/CodeMirror/commit/2c60a2 for more
 * details on that.
 *
 * @param mode         The current (outer) mode
 * @param stream       The StringStream for the current line
 * @param state        The current mode state (if any)
 * @param addModeClass Whether or not to append the current (inner) mode name
 *                     as an extra CSS clas to the token, indicating the mode
 *                     that produced it, prefixed with "cm-m-". For example,
 *                     tokens from the XML mode will get the cm-m-xml class.
 */
function readToken(
  mode: CodeMirror.Mode<{}>,
  stream: StringStream,
  state: any,
  addModeClass: boolean
): string | null {
  for (let i = 0; i < 10; i++) {
    const innerModeName = addModeClass ? getInnerModeName(mode, state) : null
    const token = mode.token(stream, state)

    if (stream.pos > stream.start) {
      return token && innerModeName ? `m-${innerModeName} ${token}` : token
    }
  }

  throw new Error(`Mode ${getModeName(mode)} failed to advance stream.`)
}

onmessage = (ev: MessageEvent) => {
  const request = ev.data as IHighlightRequest

  const tabSize = request.tabSize || 4
  const contents = request.contents
  const addModeClass = request.addModeClass === true

  const mode = detectMode(request)

  if (!mode) {
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

    const lineCtx = { lines, line: ix }
    const lineStream = new StringStream(line, tabSize, lineCtx)

    while (!lineStream.eol()) {
      const token = readToken(mode, lineStream, state, addModeClass)

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

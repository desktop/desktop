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

/**
 * A mode definition object is used to map a certain file
 * extension to a mode loader (see the documentation for
 * the install property).
 */
interface IModeDefinition {
  /**
   * A function that, when called, will attempt to asynchronously
   * load the required modules for a particular mode. This function
   * is idempotent and can be called multiple times with no adverse
   * effect.
   */
  readonly install: () => Promise<void>

  /**
   * A map between file extensions (including the leading dot, i.e.
   * ".jpeg") or basenames (i.e. "dockerfile") and the selected mime
   * type to use when highlighting that extension as specified in
   * the CodeMirror mode itself.
   */
  readonly mappings: {
    readonly [key: string]: string
  }
}

/**
 * Array describing all currently supported extensionModes and the file extensions
 * that they cover.
 */
const extensionModes: ReadonlyArray<IModeDefinition> = [
  {
    install: () => import('codemirror/mode/javascript/javascript'),
    mappings: {
      '.ts': 'text/typescript',
      '.js': 'text/javascript',
      '.json': 'application/json',
    },
  },
  {
    install: () => import('codemirror/mode/coffeescript/coffeescript'),
    mappings: {
      '.coffee': 'text/x-coffeescript',
    },
  },
  {
    install: () => import('codemirror/mode/jsx/jsx'),
    mappings: {
      '.tsx': 'text/typescript-jsx',
      '.jsx': 'text/jsx',
    },
  },
  {
    install: () => import('codemirror/mode/htmlmixed/htmlmixed'),
    mappings: {
      '.html': 'text/html',
      '.htm': 'text/html',
    },
  },
  {
    install: () => import('codemirror/mode/htmlembedded/htmlembedded'),
    mappings: {
      '.jsp': 'application/x-jsp',
    },
  },
  {
    install: () => import('codemirror/mode/css/css'),
    mappings: {
      '.css': 'text/css',
      '.scss': 'text/x-scss',
      '.less': 'text/x-less',
    },
  },
  {
    install: () => import('codemirror/mode/vue/vue'),
    mappings: {
      '.vue': 'text/x-vue',
    },
  },
  {
    install: () => import('codemirror/mode/markdown/markdown'),
    mappings: {
      '.markdown': 'text/x-markdown',
      '.md': 'text/x-markdown',
    },
  },
  {
    install: () => import('codemirror/mode/yaml/yaml'),
    mappings: {
      '.yaml': 'text/yaml',
      '.yml': 'text/yaml',
    },
  },
  {
    install: () => import('codemirror/mode/xml/xml'),
    mappings: {
      '.xml': 'text/xml',
      '.xaml': 'text/xml',
      '.csproj': 'text/xml',
      '.fsproj': 'text/xml',
      '.vcxproj': 'text/xml',
      '.vbproj': 'text/xml',
      '.svg': 'text/xml',
    },
  },
  {
    install: () => import('codemirror/mode/clike/clike'),
    mappings: {
      '.m': 'text/x-objectivec',
      '.scala': 'text/x-scala',
      '.sc': 'text/x-scala',
      '.cs': 'text/x-csharp',
      '.cake': 'text/x-csharp',
      '.java': 'text/x-java',
      '.c': 'text/x-c',
      '.h': 'text/x-c',
      '.cpp': 'text/x-c++src',
      '.hpp': 'text/x-c++src',
      '.kt': 'text/x-kotlin',
    },
  },
  {
    install: () => import('codemirror/mode/mllike/mllike'),
    mappings: {
      '.ml': 'text/x-ocaml',
      '.fs': 'text/x-fsharp',
      '.fsx': 'text/x-fsharp',
      '.fsi': 'text/x-fsharp',
    },
  },
  {
    install: () => import('codemirror/mode/swift/swift'),
    mappings: {
      '.swift': 'text/x-swift',
    },
  },
  {
    install: () => import('codemirror/mode/shell/shell'),
    mappings: {
      '.sh': 'text/x-sh',
    },
  },
  {
    install: () => import('codemirror/mode/sql/sql'),
    mappings: {
      '.sql': 'text/x-sql',
    },
  },
  {
    install: () => import('codemirror/mode/cypher/cypher'),
    mappings: {
      '.cql': 'application/x-cypher-query',
    },
  },
  {
    install: () => import('codemirror/mode/go/go'),
    mappings: {
      '.go': 'text/x-go',
    },
  },
  {
    install: () => import('codemirror/mode/perl/perl'),
    mappings: {
      '.pl': 'text/x-perl',
    },
  },
  {
    install: () => import('codemirror/mode/php/php'),
    mappings: {
      '.php': 'application/x-httpd-php',
    },
  },
  {
    install: () => import('codemirror/mode/python/python'),
    mappings: {
      '.py': 'text/x-python',
    },
  },
  {
    install: () => import('codemirror/mode/ruby/ruby'),
    mappings: {
      '.rb': 'text/x-ruby',
    },
  },
  {
    install: () => import('codemirror/mode/clojure/clojure'),
    mappings: {
      '.clj': 'text/x-clojure',
      '.cljc': 'text/x-clojure',
      '.cljs': 'text/x-clojure',
      '.edn': 'text/x-clojure',
    },
  },
  {
    install: () => import('codemirror/mode/rust/rust'),
    mappings: {
      '.rs': 'text/x-rustsrc',
    },
  },
  {
    install: () => import('codemirror-mode-elixir'),
    mappings: {
      '.ex': 'text/x-elixir',
      '.exs': 'text/x-elixir',
    },
  },
  {
    install: () => import('codemirror/mode/haxe/haxe'),
    mappings: {
      '.hx': 'text/x-haxe',
    },
  },
  {
    install: () => import('codemirror/mode/r/r'),
    mappings: {
      '.r': 'text/x-rsrc',
    },
  },
  {
    install: () => import('codemirror/mode/powershell/powershell'),
    mappings: {
      '.ps1': 'application/x-powershell',
    },
  },
  {
    install: () => import('codemirror/mode/vb/vb'),
    mappings: {
      '.vb': 'text/x-vb',
    },
  },
]

/**
 * A map between file extensions and mime types, see
 * the 'mappings' property on the IModeDefinition interface
 * for more information
 */
const extensionMIMEMap = new Map<string, string>()

/**
 * Array describing all currently supported basenameModes and the file names
 * that they cover.
 */
const basenameModes: ReadonlyArray<IModeDefinition> = [
  {
    install: () => import('codemirror/mode/dockerfile/dockerfile'),
    mappings: {
      dockerfile: 'text/x-dockerfile',
    },
  },
]

/**
 * A map between file basenames and mime types, see
 * the 'basenames' property on the IModeDefinition interface
 * for more information
 */
const basenameMIMEMap = new Map<string, string>()

/**
 * A map between mime types and mode definitions. See the
 * documentation for the IModeDefinition interface
 * for more information
 */
const mimeModeMap = new Map<string, IModeDefinition>()

for (const extensionMode of extensionModes) {
  for (const [mapping, mimeType] of Object.entries(extensionMode.mappings)) {
    extensionMIMEMap.set(mapping, mimeType)
    mimeModeMap.set(mimeType, extensionMode)
  }
}

for (const basenameMode of basenameModes) {
  for (const [mapping, mimeType] of Object.entries(basenameMode.mappings)) {
    basenameMIMEMap.set(mapping, mimeType)
    mimeModeMap.set(mimeType, basenameMode)
  }
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

async function detectMode(
  request: IHighlightRequest
): Promise<CodeMirror.Mode<{}> | null> {
  const mimeType =
    extensionMIMEMap.get(request.extension.toLowerCase()) ||
    basenameMIMEMap.get(request.basename.toLowerCase()) ||
    guessMimeType(request.contents)

  if (!mimeType) {
    return null
  }

  const modeDefinition = mimeModeMap.get(mimeType)

  if (modeDefinition === undefined) {
    return null
  }

  await modeDefinition.install()

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

onmessage = async (ev: MessageEvent) => {
  const request = ev.data as IHighlightRequest

  const tabSize = request.tabSize || 4
  const contents = request.contents
  const addModeClass = request.addModeClass === true

  const mode = await detectMode(request)

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

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
 * the require property).
 */
interface IModeDefinition {
  /**
   * A function that, when called, will attempt to asynchronously
   * load the required modules for a particular mode. This function
   * is idempotent and can be called multiple times with no adverse
   * effect.
   */
  readonly require: () => Promise<void>

  /**
   * A map between file extensions (including the leading dot, i.e.
   * ".jpeg") and the selected mime type to use when highlighting
   * that extension as specified in the CodeMirror mode itself.
   */
  readonly extensions: {
    readonly [key: string]: string
  }
}

/**
 * Array describing all currently supported modes and the file extensions
 * that they cover.
 */
const modes: ReadonlyArray<IModeDefinition> = [
  {
    require: () => import('codemirror/mode/javascript/javascript'),
    extensions: {
      '.ts': 'text/typescript',
      '.js': 'text/javascript',
      '.json': 'application/json',
    },
  },
  {
    require: () => import('codemirror/mode/coffeescript/coffeescript'),
    extensions: {
      '.coffee': 'text/x-coffeescript',
    },
  },
  {
    require: () => import('codemirror/mode/jsx/jsx'),
    extensions: {
      '.tsx': 'text/typescript-jsx',
      '.jsx': 'text/jsx',
    },
  },
  {
    require: () => import('codemirror/mode/htmlmixed/htmlmixed'),
    extensions: {
      '.html': 'text/html',
      '.htm': 'text/html',
    },
  },
  {
    require: () => import('codemirror/mode/htmlembedded/htmlembedded'),
    extensions: {
      '.jsp': 'application/x-jsp',
    },
  },
  {
    require: () => import('codemirror/mode/css/css'),
    extensions: {
      '.css': 'text/css',
      '.scss': 'text/x-scss',
      '.less': 'text/x-less',
    },
  },
  {
    require: () => import('codemirror/mode/vue/vue'),
    extensions: {
      '.vue': 'text/x-vue',
    },
  },
  {
    require: () => import('codemirror/mode/markdown/markdown'),
    extensions: {
      '.markdown': 'text/x-markdown',
      '.md': 'text/x-markdown',
    },
  },
  {
    require: () => import('codemirror/mode/yaml/yaml'),
    extensions: {
      '.yaml': 'text/yaml',
      '.yml': 'text/yaml',
    },
  },
  {
    require: () => import('codemirror/mode/xml/xml'),
    extensions: {
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
    require: () => import('codemirror/mode/clike/clike'),
    extensions: {
      '.m': 'text/x-objectivec',
      '.scala': 'text/x-scala',
      '.sc': 'text/x-scala',
      '.cs': 'text/x-csharp',
      '.java': 'text/x-java',
      '.c': 'text/x-c',
      '.h': 'text/x-c',
      '.cpp': 'text/x-c++src',
      '.hpp': 'text/x-c++src',
      '.kt': 'text/x-kotlin',
    },
  },
  {
    require: () => import('codemirror/mode/mllike/mllike'),
    extensions: {
      '.ml': 'text/x-ocaml',
      '.fs': 'text/x-fsharp',
      '.fsx': 'text/x-fsharp',
      '.fsi': 'text/x-fsharp',
    },
  },
  {
    require: () => import('codemirror/mode/swift/swift'),
    extensions: {
      '.swift': 'text/x-swift',
    },
  },
  {
    require: () => import('codemirror/mode/shell/shell'),
    extensions: {
      '.sh': 'text/x-sh',
    },
  },
  {
    require: () => import('codemirror/mode/sql/sql'),
    extensions: {
      '.sql': 'text/x-sql',
    },
  },
  {
    require: () => import('codemirror/mode/cypher/cypher'),
    extensions: {
      '.cql': 'application/x-cypher-query',
    },
  },
  {
    require: () => import('codemirror/mode/go/go'),
    extensions: {
      '.go': 'text/x-go',
    },
  },
  {
    require: () => import('codemirror/mode/perl/perl'),
    extensions: {
      '.pl': 'text/x-perl',
    },
  },
  {
    require: () => import('codemirror/mode/php/php'),
    extensions: {
      '.php': 'application/x-httpd-php',
    },
  },
  {
    require: () => import('codemirror/mode/python/python'),
    extensions: {
      '.py': 'text/x-python',
    },
  },
  {
    require: () => import('codemirror/mode/ruby/ruby'),
    extensions: {
      '.rb': 'text/x-ruby',
    },
  },
  {
    require: () => import('codemirror/mode/clojure/clojure'),
    extensions: {
      '.clj': 'text/x-clojure',
      '.cljc': 'text/x-clojure',
      '.cljs': 'text/x-clojure',
      '.edn': 'text/x-clojure',
    },
  },
  {
    require: () => import('codemirror/mode/rust/rust'),
    extensions: {
      '.rs': 'text/x-rustsrc',
    },
  },
  {
    require: () => import('codemirror-mode-elixir'),
    extensions: {
      '.ex': 'text/x-elixir',
      '.exs': 'text/x-elixir',
    },
  },
  {
    require: () => import('codemirror/mode/haxe/haxe'),
    extensions: {
      '.hx': 'text/x-haxe',
    },
  },
  {
    require: () => import('codemirror/mode/r/r'),
    extensions: {
      '.r': 'text/x-rsrc',
    },
  },
]

/**
 * A map between file extensions and mime types, see
 * the 'extensions' property on the IModeDefinition interface
 * for more information
 */
const extensionMIMEMap = new Map<string, string>()

/**
 * A map between mime types and mode definitions. See the
 * documentation for the IModeDefinition interface
 * for more information
 */
const mimeModeMap = new Map<string, IModeDefinition>()

for (const mode of modes) {
  for (const [extension, mimeType] of Object.entries(mode.extensions)) {
    extensionMIMEMap.set(extension, mimeType)
    mimeModeMap.set(mimeType, mode)
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
    guessMimeType(request.contents)

  if (!mimeType) {
    return null
  }

  const modeDefinition = mimeModeMap.get(mimeType)

  if (modeDefinition === undefined) {
    return null
  }

  await modeDefinition.require()

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

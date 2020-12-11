/* eslint-disable typescript/interface-name-prefix */

declare namespace CodeMirror {
  interface EditorConfiguration {
    /** How many spaces a block (whatever that means in the edited language) should be indented. The default is 2. */
    indentUnit?: number

    /** The width of a tab character. Defaults to 4. */
    tabSize?: number
  }

  /**
   * A function that, given a CodeMirror configuration object and an optional mode configuration object, returns a mode object.
   */
  interface ModeFactory<T> {
    (config: CodeMirror.EditorConfiguration, modeOptions?: any): Mode<T>
  }

  interface StringStreamContext {
    lines: string[]
    line: number
  }

  /**
   * A Mode is, in the simplest case, a lexer (tokenizer) for your language — a function that takes a character stream as input,
   * advances it past a token, and returns a style for that token. More advanced modes can also handle indentation for the language.
   */
  interface Mode<T> {
    /**
     * A function that produces a state object to be used at the start of a document.
     */
    startState?: () => T
    /**
     * For languages that have significant blank lines, you can define a blankLine(state) method on your mode that will get called
     * whenever a blank line is passed over, so that it can update the parser state.
     */
    blankLine?: (state: T) => void
    /**
     * Given a state returns a safe copy of that state.
     */
    copyState?: (state: T) => T

    /**
     * The indentation method should inspect the given state object, and optionally the textAfter string, which contains the text on
     * the line that is being indented, and return an integer, the amount of spaces to indent.
     */
    indent?: (state: T, textAfter: string) => number

    /** The four below strings are used for working with the commenting addon. */
    /**
     * String that starts a line comment.
     */
    lineComment?: string
    /**
     * String that starts a block comment.
     */
    blockCommentStart?: string
    /**
     * String that ends a block comment.
     */
    blockCommentEnd?: string
    /**
     * String to put at the start of continued lines in a block comment.
     */
    blockCommentLead?: string

    /**
     * Trigger a reindent whenever one of the characters in the string is typed.
     */
    electricChars?: string
    /**
     * Trigger a reindent whenever the regex matches the part of the line before the cursor.
     */
    electricinput?: RegExp

    /**
     * This function should read one token from the stream it is given as an argument, optionally update its state,
     * and return a style string, or null for tokens that do not have to be styled. Multiple styles can be returned, separated by spaces.
     */
    token(stream: StringStream, state: T): string | null
  }

  class StringStream {
    public lastColumnPos: number
    public lastColumnValue: number
    public lineStart: number

    /**
     * Current position in the string.
     */
    public pos: number

    /**
     * Where the stream's position was when it was first passed to the token function.
     */
    public start: number

    /**
     * The current line's content.
     */
    public string: string

    /**
     * Number of spaces per tab character.
     */
    public tabSize: number

    public constructor(
      // tslint:disable-next-line:variable-name
      string: string,
      tabSize: number,
      context: StringStreamContext
    )

    /**
     * Returns true only if the stream is at the end of the line.
     */
    public eol(): boolean

    /**
     * Returns true only if the stream is at the start of the line.
     */
    public sol(): boolean

    /**
     * Returns the next character in the stream without advancing it. Will return an null at the end of the line.
     */
    public peek(): string | null

    /**
     * Returns the next character in the stream and advances it. Also returns null when no more characters are available.
     */
    public next(): string | null

    /**
     * match can be a character, a regular expression, or a function that takes a character and returns a boolean.
     * If the next character in the stream 'matches' the given argument, it is consumed and returned.
     * Otherwise, undefined is returned.
     */
    public eat(match: string): string
    public eat(match: RegExp): string
    public eat(match: (char: string) => boolean): string

    /**
     * Repeatedly calls eat with the given argument, until it fails. Returns true if any characters were eaten.
     */
    public eatWhile(match: string): boolean
    public eatWhile(match: RegExp): boolean
    public eatWhile(match: (char: string) => boolean): boolean

    /**
     * Shortcut for eatWhile when matching white-space.
     */
    public eatSpace(): boolean

    /**
     * Moves the position to the end of the line.
     */
    public skipToEnd(): void

    /**
     * Skips to the next occurrence of the given character, if found on the current line (doesn't advance the stream if
     * the character does not occur on the line).
     *
     * Returns true if the character was found.
     */
    public skipTo(ch: string): boolean

    /**
     * Act like a multi-character eat - if consume is true or not given - or a look-ahead that doesn't update the stream
     * position - if it is false. pattern can be either a string or a regular expression starting with ^. When it is a
     * string, caseFold can be set to true to make the match case-insensitive. When successfully matching a regular
     * expression, the returned value will be the array returned by match, in case you need to extract matched groups.
     */
    public match(
      pattern: string,
      consume?: boolean,
      caseFold?: boolean
    ): boolean
    public match(pattern: RegExp, consume?: boolean): string[]

    /**
     * Backs up the stream n characters. Backing it up further than the start of the current token will cause things to
     * break, so be careful.
     */
    public backUp(n: number): void

    /**
     * Returns the column (taking into account tabs) at which the current token starts.
     */
    public column(): number

    /**
     * Tells you how far the current line has been indented, in spaces. Corrects for tab characters.
     */
    public indentation(): number

    /**
     * Get the string between the start of the current token and the current stream position.
     */
    public current(): string
  }

  /**
   * The first argument is a configuration object as passed to the mode constructor function, and the second argument
   * is a mode specification as in the EditorConfiguration mode option.
   */
  function getMode<T>(
    config: CodeMirror.EditorConfiguration,
    mode: any
  ): Mode<T>

  /**
   * id will be the id for the defined mode. Typically, you should use this second argument to defineMode as your module scope function
   * (modes should not leak anything into the global scope!), i.e. write your whole mode inside this function.
   */
  function defineMode(id: string, modefactory: ModeFactory<any>): void

  function defineMIME(mime: string, spec: any): void

  function startState(mode: Mode<{}>, a1: any, a2: any): any

  function resolveMode(spec: any): any

  function extendMode(mode: any, properties: any): void

  /**
   * Runs a CodeMirror mode over text without opening an editor instance.
   *
   * @param text The document to run through the highlighter.
   * @param mode The mode to use (must be loaded as normal).
   * @param output If this is a function, it will be called for each token with
   *               two arguments, the token's text and the token's style class
   *               (may be null for unstyled tokens). If it is a DOM node, the
   *               tokens will be converted to span elements as in an editor,
   *               and inserted into the node (through innerHTML).
   */
  function runMode(
    text: string,
    modespec: any,
    callback: (text: string, style: string | null) => void,
    options?: { tabSize?: number; state?: any }
  ): void

  function innerMode(
    mode: CodeMirror.Mode<{}>,
    state: any
  ): { mode: CodeMirror.Mode<{}>; state: any }
}

declare module 'codemirror/addon/runmode/runmode.node.js' {
  export = CodeMirror
}

declare module 'codemirror-mode-elixir'

// find app/node_modules/codemirror/mode -iname *.js | cut -d '/' -f 3- | cut -d '.' -f 1 | sed -e "s/^/declare module '/" | sed -e "s/$/'/"
declare module 'codemirror/mode/scheme/scheme'
declare module 'codemirror/mode/modelica/modelica'
declare module 'codemirror/mode/idl/idl'
declare module 'codemirror/mode/pascal/pascal'
declare module 'codemirror/mode/nsis/nsis'
declare module 'codemirror/mode/haml/haml'
declare module 'codemirror/mode/toml/toml'
declare module 'codemirror/mode/pig/pig'
declare module 'codemirror/mode/gas/gas'
declare module 'codemirror/mode/go/go'
declare module 'codemirror/mode/apl/apl'
declare module 'codemirror/mode/textile/textile'
declare module 'codemirror/mode/turtle/turtle'
declare module 'codemirror/mode/sparql/sparql'
declare module 'codemirror/mode/troff/troff'
declare module 'codemirror/mode/cmake/cmake'
declare module 'codemirror/mode/htmlembedded/htmlembedded'
declare module 'codemirror/mode/xquery/xquery'
declare module 'codemirror/mode/python/python'
declare module 'codemirror/mode/css/css'
declare module 'codemirror/mode/clojure/clojure'
declare module 'codemirror/mode/spreadsheet/spreadsheet'
declare module 'codemirror/mode/asn.1/asn.1'
declare module 'codemirror/mode/z80/z80'
declare module 'codemirror/mode/jinja2/jinja2'
declare module 'codemirror/mode/gherkin/gherkin'
declare module 'codemirror/mode/asterisk/asterisk'
declare module 'codemirror/mode/dockerfile/dockerfile'
declare module 'codemirror/mode/dart/dart'
declare module 'codemirror/mode/shell/shell'
declare module 'codemirror/mode/yacas/yacas'
declare module 'codemirror/mode/markdown/markdown'
declare module 'codemirror/mode/haxe/haxe'
declare module 'codemirror/mode/soy/soy'
declare module 'codemirror/mode/perl/perl'
declare module 'codemirror/mode/smalltalk/smalltalk'
declare module 'codemirror/mode/dylan/dylan'
declare module 'codemirror/mode/stylus/stylus'
declare module 'codemirror/mode/vue/vue'
declare module 'codemirror/mode/rust/rust'
declare module 'codemirror/mode/rst/rst'
declare module 'codemirror/mode/tiddlywiki/tiddlywiki'
declare module 'codemirror/mode/pug/pug'
declare module 'codemirror/mode/erlang/erlang'
declare module 'codemirror/mode/r/r'
declare module 'codemirror/mode/mathematica/mathematica'
declare module 'codemirror/mode/yaml-frontmatter/yaml-frontmatter'
declare module 'codemirror/mode/diff/diff'
declare module 'codemirror/mode/elm/elm'
declare module 'codemirror/mode/crystal/crystal'
declare module 'codemirror/mode/cypher/cypher'
declare module 'codemirror/mode/htmlmixed/htmlmixed'
declare module 'codemirror/mode/ebnf/ebnf'
declare module 'codemirror/mode/webidl/webidl'
declare module 'codemirror/mode/smarty/smarty'
declare module 'codemirror/mode/stex/stex'
declare module 'codemirror/mode/haskell/haskell'
declare module 'codemirror/mode/factor/factor'
declare module 'codemirror/mode/php/php'
declare module 'codemirror/mode/pegjs/pegjs'
declare module 'codemirror/mode/lua/lua'
declare module 'codemirror/mode/velocity/velocity'
declare module 'codemirror/mode/xml/xml'
declare module 'codemirror/mode/solr/solr'
declare module 'codemirror/mode/mbox/mbox'
declare module 'codemirror/mode/mllike/mllike'
declare module 'codemirror/mode/vb/vb'
declare module 'codemirror/mode/powershell/powershell'
declare module 'codemirror/mode/tornado/tornado'
declare module 'codemirror/mode/vhdl/vhdl'
declare module 'codemirror/mode/tiki/tiki'
declare module 'codemirror/mode/clike/clike'
declare module 'codemirror/mode/tcl/tcl'
declare module 'codemirror/mode/brainfuck/brainfuck'
declare module 'codemirror/mode/ttcn/ttcn'
declare module 'codemirror/mode/dtd/dtd'
declare module 'codemirror/mode/octave/octave'
declare module 'codemirror/mode/properties/properties'
declare module 'codemirror/mode/verilog/verilog'
declare module 'codemirror/mode/handlebars/handlebars'
declare module 'codemirror/mode/nginx/nginx'
declare module 'codemirror/mode/http/http'
declare module 'codemirror/mode/asciiarmor/asciiarmor'
declare module 'codemirror/mode/swift/swift'
declare module 'codemirror/mode/meta'
declare module 'codemirror/mode/sas/sas'
declare module 'codemirror/mode/sieve/sieve'
declare module 'codemirror/mode/livescript/livescript'
declare module 'codemirror/mode/commonlisp/commonlisp'
declare module 'codemirror/mode/fcl/fcl'
declare module 'codemirror/mode/yaml/yaml'
declare module 'codemirror/mode/fortran/fortran'
declare module 'codemirror/mode/julia/julia'
declare module 'codemirror/mode/oz/oz'
declare module 'codemirror/mode/groovy/groovy'
declare module 'codemirror/mode/coffeescript/coffeescript'
declare module 'codemirror/mode/slim/slim'
declare module 'codemirror/mode/javascript/javascript'
declare module 'codemirror/mode/mscgen/mscgen'
declare module 'codemirror/mode/twig/twig'
declare module 'codemirror/mode/eiffel/eiffel'
declare module 'codemirror/mode/cobol/cobol'
declare module 'codemirror/mode/sass/sass'
declare module 'codemirror/mode/rpm/rpm'
declare module 'codemirror/mode/mumps/mumps'
declare module 'codemirror/mode/vbscript/vbscript'
declare module 'codemirror/mode/ttcn-cfg/ttcn-cfg'
declare module 'codemirror/mode/forth/forth'
declare module 'codemirror/mode/puppet/puppet'
declare module 'codemirror/mode/django/django'
declare module 'codemirror/mode/d/d'
declare module 'codemirror/mode/q/q'
declare module 'codemirror/mode/jsx/jsx'
declare module 'codemirror/mode/protobuf/protobuf'
declare module 'codemirror/mode/gfm/gfm'
declare module 'codemirror/mode/ecl/ecl'
declare module 'codemirror/mode/ruby/ruby'
declare module 'codemirror/mode/mirc/mirc'
declare module 'codemirror/mode/haskell-literate/haskell-literate'
declare module 'codemirror/mode/ntriples/ntriples'
declare module 'codemirror/mode/sql/sql'

/// <reference path="../../../node_modules/typescript/lib/lib.scripthost.d.ts" />
/// <reference path="../../../node_modules/typescript/lib/lib.webworker.d.ts" />
/// <reference path="../../../node_modules/typescript/lib/lib.dom.d.ts" />
/// <reference path="../../../node_modules/typescript/lib/lib.es2017.d.ts" />
/// <reference types="codemirror" />

declare module 'codemirror/src/modes' {
  export function innerMode(
    mode: CodeMirror.Mode<{}>,
    state: any
  ): { mode: CodeMirror.Mode<{}>; state: any }
}

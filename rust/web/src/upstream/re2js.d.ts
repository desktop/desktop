/** Matcher-only types for the pinned engine resolved by the standalone oracle builder. */
declare module 're2js' {
  export class RE2JS {
    public static compile(pattern: string): RE2JS
    public static quote(pattern: string): string
    public test(value: string): boolean
  }
}

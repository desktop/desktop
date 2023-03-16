export interface IFoundShell<T> {
  readonly shell: T
  readonly path: string
  readonly extraArgs?: string[]
}

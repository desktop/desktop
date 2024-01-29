export interface IFoundShell<T> {
  readonly shell: T
  readonly path: string
  readonly extraArgs?: string[]
}

export interface IFoundDarwinShell<T> extends IFoundShell<T> {
  readonly bundleID: string
}

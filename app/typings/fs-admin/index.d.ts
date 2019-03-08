declare module 'fs-admin' {
  export function makeTree(
    path: string | Buffer,
    callback: (err: Error | null) => void
  ): void

  export function unlink(
    path: string | Buffer,
    callback: (err: Error | null) => void
  ): void

  export function symlink(
    srcpath: string | Buffer,
    dstpath: string | Buffer,
    callback: (err: Error | null) => void
  ): void
}

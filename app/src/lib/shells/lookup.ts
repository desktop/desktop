interface IFoundShell {}

let shellCache: ReadonlyArray<IFoundShell> | null = null

export async function getAvailableShells(): Promise<
  ReadonlyArray<IFoundShell>
> {
  if (shellCache) {
    return shellCache
  }
}

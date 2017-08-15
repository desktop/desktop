export enum Shell {}

export async function getAvailableShells(): Promise<ReadonlyArray<Shell>> {
  return []
}

export async function launch(shell: Shell): Promise<void> {}

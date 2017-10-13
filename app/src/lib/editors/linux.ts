import { FoundEditor } from './shared'

// TODO
export enum ExternalEditor {}

// TODO
export function parse(label: string): ExternalEditor | null {
  return null
}

export async function getAvailableEditors(): Promise<
  ReadonlyArray<FoundEditor>
> {
  return Promise.resolve([])
}

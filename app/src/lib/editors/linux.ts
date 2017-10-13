import { IFoundEditor } from './found-editor'

// TODO
export enum ExternalEditor {}

// TODO
export function parse(label: string): ExternalEditor | null {
  return null
}

export async function getAvailableEditors(): Promise<
  ReadonlyArray<IFoundEditor<ExternalEditor>>
> {
  return Promise.resolve([])
}

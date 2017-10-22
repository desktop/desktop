import { IFoundEditor } from './found-editor'
import { pathExists } from '../file-system'
import { assertNever } from '../fatal-error'

export enum ExternalEditor {
  VisualStudioCode = 'Visual Studio Code',
}

export function parse(label: string): ExternalEditor | null {
  if (label === ExternalEditor.VisualStudioCode) {
    return ExternalEditor.VisualStudioCode
  }

  return null
}

async function getPathIfAvailable(path: string): Promise<string | null> {
  return (await pathExists(path)) ? path : null
}

function getEditorPath(editor: ExternalEditor): Promise<string | null> {
  switch (editor) {
    case ExternalEditor.VisualStudioCode:
      return getPathIfAvailable('/usr/bin/code')
    default:
      return assertNever(editor, `Unknown editor: ${editor}`)
  }
}

export async function getAvailableEditors(): Promise<
  ReadonlyArray<IFoundEditor<ExternalEditor>>
> {
  const results: Array<IFoundEditor<ExternalEditor>> = []

  const [codePath] = await Promise.all([
    getEditorPath(ExternalEditor.VisualStudioCode),
  ])

  if (codePath) {
    results.push({ editor: ExternalEditor.VisualStudioCode, path: codePath })
  }

  return results
}

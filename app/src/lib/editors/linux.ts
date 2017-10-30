import { IFoundEditor } from './found-editor'
import { pathExists } from '../file-system'
import { assertNever } from '../fatal-error'

export enum ExternalEditor {
  Atom = 'Atom',
  VisualStudioCode = 'Visual Studio Code',
  SublimeText = 'Sublime Text',
}

export function parse(label: string): ExternalEditor | null {
  if (label === ExternalEditor.Atom) {
    return ExternalEditor.Atom
  }

  if (label === ExternalEditor.VisualStudioCode) {
    return ExternalEditor.VisualStudioCode
  }

  if (label === ExternalEditor.SublimeText) {
    return ExternalEditor.SublimeText
  }

  return null
}

async function getPathIfAvailable(path: string): Promise<string | null> {
  return (await pathExists(path)) ? path : null
}

function getEditorPath(editor: ExternalEditor): Promise<string | null> {
  switch (editor) {
    case ExternalEditor.Atom:
      return getPathIfAvailable('/usr/bin/atom')
    case ExternalEditor.VisualStudioCode:
      const codePath = getPathIfAvailable('/usr/bin/code')
      if (codePath) {
        return codePath
      }
      return getPathIfAvailable('/usr/bin/code-insiders')
    case ExternalEditor.SublimeText:
      return getPathIfAvailable('/usr/bin/subl')
    default:
      return assertNever(editor, `Unknown editor: ${editor}`)
  }
}

export async function getAvailableEditors(): Promise<
  ReadonlyArray<IFoundEditor<ExternalEditor>>
> {
  const results: Array<IFoundEditor<ExternalEditor>> = []

  const [atomPath, codePath, sublimePath] = await Promise.all([
    getEditorPath(ExternalEditor.Atom),
    getEditorPath(ExternalEditor.VisualStudioCode),
    getEditorPath(ExternalEditor.SublimeText),
  ])

  if (atomPath) {
    results.push({ editor: ExternalEditor.Atom, path: atomPath })
  }

  if (codePath) {
    results.push({ editor: ExternalEditor.VisualStudioCode, path: codePath })
  }

  if (sublimePath) {
    results.push({ editor: ExternalEditor.SublimeText, path: sublimePath })
  }

  return results
}

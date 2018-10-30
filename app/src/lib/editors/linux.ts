import { pathExists } from 'fs-extra'

import { IFoundEditor } from './found-editor'
import { assertNever } from '../fatal-error'

export enum ExternalEditor {
  Atom = 'Atom',
  VisualStudioCode = 'Visual Studio Code',
  VisualStudioCodeInsiders = 'Visual Studio Code (Insiders)',
  SublimeText = 'Sublime Text',
  Typora = 'Typora',
  SlickEdit = 'Visual SlickEdit',
}

export function parse(label: string): ExternalEditor | null {
  if (label === ExternalEditor.Atom) {
    return ExternalEditor.Atom
  }

  if (label === ExternalEditor.VisualStudioCode) {
    return ExternalEditor.VisualStudioCode
  }

  if (label === ExternalEditor.VisualStudioCodeInsiders) {
    return ExternalEditor.VisualStudioCode
  }

  if (label === ExternalEditor.SublimeText) {
    return ExternalEditor.SublimeText
  }

  if (label === ExternalEditor.Typora) {
    return ExternalEditor.Typora
  }

  if (label === ExternalEditor.SlickEdit) {
    return ExternalEditor.SlickEdit
  }

  return null
}

async function getPathIfAvailable(path: string): Promise<string | null> {
  return (await pathExists(path)) ? path : null
}

async function getEditorPath(editor: ExternalEditor): Promise<string | null> {
  switch (editor) {
    case ExternalEditor.Atom:
      return getPathIfAvailable('/usr/bin/atom')
    case ExternalEditor.VisualStudioCode:
      return getPathIfAvailable('/usr/bin/code')
    case ExternalEditor.VisualStudioCodeInsiders:
      return getPathIfAvailable('/usr/bin/code-insiders')
    case ExternalEditor.SublimeText:
      return getPathIfAvailable('/usr/bin/subl')
    case ExternalEditor.Typora:
      return getPathIfAvailable('/usr/bin/typora')
    case ExternalEditor.SlickEdit:
      const possiblePaths = [
        '/opt/slickedit-pro2018/bin/vs',
        '/opt/slickedit-pro2017/bin/vs',
        '/opt/slickedit-pro2016/bin/vs',
        '/opt/slickedit-pro2015/bin/vs',
      ]
      for (const possiblePath of possiblePaths) {
        const slickeditPath = await getPathIfAvailable(possiblePath)
        if (slickeditPath) {
          return slickeditPath
        }
      }
      return null
    default:
      return assertNever(editor, `Unknown editor: ${editor}`)
  }
}

export async function getAvailableEditors(): Promise<
  ReadonlyArray<IFoundEditor<ExternalEditor>>
> {
  const results: Array<IFoundEditor<ExternalEditor>> = []

  const [
    atomPath,
    codePath,
    codeInsidersPath,
    sublimePath,
    typoraPath,
    slickeditPath,
  ] = await Promise.all([
    getEditorPath(ExternalEditor.Atom),
    getEditorPath(ExternalEditor.VisualStudioCode),
    getEditorPath(ExternalEditor.VisualStudioCodeInsiders),
    getEditorPath(ExternalEditor.SublimeText),
    getEditorPath(ExternalEditor.Typora),
    getEditorPath(ExternalEditor.SlickEdit),
  ])

  if (atomPath) {
    results.push({ editor: ExternalEditor.Atom, path: atomPath })
  }

  if (codePath) {
    results.push({ editor: ExternalEditor.VisualStudioCode, path: codePath })
  }

  if (codeInsidersPath) {
    results.push({
      editor: ExternalEditor.VisualStudioCode,
      path: codeInsidersPath,
    })
  }

  if (sublimePath) {
    results.push({ editor: ExternalEditor.SublimeText, path: sublimePath })
  }

  if (typoraPath) {
    results.push({ editor: ExternalEditor.Typora, path: typoraPath })
  }

  if (slickeditPath) {
    results.push({ editor: ExternalEditor.SlickEdit, path: slickeditPath })
  }

  return results
}

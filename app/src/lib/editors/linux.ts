import { pathExists } from 'fs-extra'

import { IFoundEditor } from './found-editor'
import { assertNever } from '../fatal-error'

export enum ExternalEditor {
  Atom = 'Atom',
  VSCode = 'Visual Studio Code',
  VSCodeInsiders = 'Visual Studio Code (Insiders)',
  VSCodium = 'VSCodium',
  SublimeText = 'Sublime Text',
  Typora = 'Typora',
  SlickEdit = 'SlickEdit',
  ElementaryCode = 'Code',
}

export function parse(label: string): ExternalEditor | null {
  if (label === ExternalEditor.Atom) {
    return ExternalEditor.Atom
  }

  if (label === ExternalEditor.VSCode) {
    return ExternalEditor.VSCode
  }

  if (label === ExternalEditor.VSCodeInsiders) {
    return ExternalEditor.VSCode
  }

  if (label === ExternalEditor.VSCodium) {
    return ExternalEditor.VSCodium
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

  if (label === ExternalEditor.ElementaryCode) {
    return ExternalEditor.ElementaryCode
  }

  return null
}

async function getPathIfAvailable(path: string): Promise<string | null> {
  return (await pathExists(path)) ? path : null
}

async function getFirstPathIfAvailable(
  possiblePaths: string[]
): Promise<string | null> {
  for (const possiblePath of possiblePaths) {
    const path = await getPathIfAvailable(possiblePath)
    if (path) {
      return path
    }
  }
  return null
}

async function getEditorPath(editor: ExternalEditor): Promise<string | null> {
  switch (editor) {
    case ExternalEditor.Atom:
      return getFirstPathIfAvailable(['/snap/bin/atom', '/usr/bin/atom'])
    case ExternalEditor.VSCode:
      return getFirstPathIfAvailable(['/snap/bin/code', '/usr/bin/code'])
    case ExternalEditor.VSCodeInsiders:
      return getFirstPathIfAvailable([
        '/snap/bin/code-insiders',
        '/usr/bin/code-insiders',
      ])
    case ExternalEditor.VSCodium:
      return getPathIfAvailable('/usr/bin/codium')
    case ExternalEditor.SublimeText:
      return getPathIfAvailable('/usr/bin/subl')
    case ExternalEditor.Typora:
      return getPathIfAvailable('/usr/bin/typora')
    case ExternalEditor.SlickEdit:
      return getFirstPathIfAvailable([
        '/opt/slickedit-pro2018/bin/vs',
        '/opt/slickedit-pro2017/bin/vs',
        '/opt/slickedit-pro2016/bin/vs',
        '/opt/slickedit-pro2015/bin/vs',
      ])
    case ExternalEditor.ElementaryCode:
      return getPathIfAvailable('/usr/bin/io.elementary.code')

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
    codiumPath,
    sublimePath,
    typoraPath,
    slickeditPath,
    elementaryCodePath,
  ] = await Promise.all([
    getEditorPath(ExternalEditor.Atom),
    getEditorPath(ExternalEditor.VSCode),
    getEditorPath(ExternalEditor.VSCodeInsiders),
    getEditorPath(ExternalEditor.VSCodium),
    getEditorPath(ExternalEditor.SublimeText),
    getEditorPath(ExternalEditor.Typora),
    getEditorPath(ExternalEditor.SlickEdit),
    getEditorPath(ExternalEditor.ElementaryCode),
  ])

  if (atomPath) {
    results.push({ editor: ExternalEditor.Atom, path: atomPath })
  }

  if (codePath) {
    results.push({ editor: ExternalEditor.VSCode, path: codePath })
  }

  if (codeInsidersPath) {
    results.push({ editor: ExternalEditor.VSCode, path: codeInsidersPath })
  }

  if (codiumPath) {
    results.push({ editor: ExternalEditor.VSCodium, path: codiumPath })
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

  if (elementaryCodePath) {
    results.push({
      editor: ExternalEditor.ElementaryCode,
      path: elementaryCodePath,
    })
  }

  return results
}

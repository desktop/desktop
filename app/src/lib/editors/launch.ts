import { spawn } from 'child_process'

import { getAvailableEditors } from './lookup'

import { fatalError } from '../../lib/fatal-error'

async function getPathToEditor(app: string): Promise<string> {
  const programs = await getAvailableEditors()
  const match = programs.find(p => p.app === app)
  if (match) {
    return match.path
  } else {
    return ''
  }
}

export async function launchExternalEditor(
  path: string,
  app: string
): Promise<void> {
  const editorPath = await getPathToEditor(app)

  if (__WIN32__) {
    spawn(editorPath, [path])
    return
  }

  return fatalError('Unsupported OS')
}

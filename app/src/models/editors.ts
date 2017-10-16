export enum ExternalEditor {
  Atom = 'Atom',
  VisualStudioCode = 'Visual Studio Code',
  SublimeText = 'Sublime Text',
  BBEdit = 'BBEdit',
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

  if (label === ExternalEditor.BBEdit) {
    return ExternalEditor.BBEdit
  }

  return null
}

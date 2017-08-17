export enum ExternalEditor {
  Atom = 'Atom',
  VisualStudioCode = 'Visual Studio Code',
  SublimeText = 'Sublime Text',
  TextMate = 'TextMate',
}

export function parse(label: string | null): ExternalEditor {
  if (label === ExternalEditor.Atom) {
    return ExternalEditor.Atom
  }

  if (label === ExternalEditor.VisualStudioCode) {
    return ExternalEditor.VisualStudioCode
  }

  if (label === ExternalEditor.SublimeText) {
    return ExternalEditor.SublimeText
  }

  if (label === ExternalEditor.TextMate) {
    return ExternalEditor.TextMate
  }

  return ExternalEditor.Atom
}

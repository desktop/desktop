export enum Shell {
  Terminal = 'Terminal',
  Hyper = 'Hyper',
  iTerm2 = 'iTerm2',
  Default = Terminal,
}

export function parse(label: string | null): Shell {
  if (label === Shell.Terminal) {
    return Shell.Terminal
  }

  if (label === Shell.Hyper) {
    return Shell.Hyper
  }

  if (label === Shell.iTerm2) {
    return Shell.iTerm2
  }

  return Shell.Terminal
}

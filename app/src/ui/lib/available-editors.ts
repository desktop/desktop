export function getAvailableEditors(): Promise<ReadonlyArray<string>> {
  // TODO: list entries that exist on the user's machine
  // TODO: include the name and the executable path to use
  // TODO: use platform-specific lookups here to make this more maintainable
  return Promise.resolve(['Atom', 'Visual Studio Code', 'Sublime Text'])
}

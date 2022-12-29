export function getAvailableTabSizes(): ReadonlyArray<number> {
  return [1, 2, 3, 4, 5, 6, 8, 10, 12];
}

const defaultTabSize = 4

export function setTabSize(tabSize: number): void {
  localStorage.setItem('tabSize', String(tabSize))
}

export function getTabSize(): number {
  const localTabSize = localStorage.getItem('tabSize');
  return localTabSize === null
    ? defaultTabSize
    : parseInt(localTabSize)
}

const markdownPreviewFileExtensions = ['.md', '.markdown'] as const

/** True when the repository-relative path is a Markdown file we preview in Changes. */
export function isMarkdownPreviewablePath(path: string): boolean {
  const lower = path.toLowerCase()
  return markdownPreviewFileExtensions.some(ext => lower.endsWith(ext))
}

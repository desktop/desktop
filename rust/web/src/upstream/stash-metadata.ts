// Moved from GitHub Desktop's app/src/lib/git/stash.ts (MIT).
export const DesktopStashEntryMarker = '!!GitHub_Desktop'
const desktopStashEntryMessageRe = /!!GitHub_Desktop<(.+)>$/

/** Create the branch marker shared with existing Desktop stash entries. */
export function createDesktopStashMessage(branchName: string) {
  return `${DesktopStashEntryMarker}<${branchName}>`
}

/** Read the branch associated with an existing Desktop stash message. */
export function extractBranchFromMessage(message: string): string | null {
  const match = desktopStashEntryMessageRe.exec(message)
  return match === null || match[1].length === 0 ? null : match[1]
}

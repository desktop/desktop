import { IMenuItem } from '../../lib/menu-item'
import { clipboard } from 'electron'

export function createBranchContextMenuItems(
  name: string,
  isLocal: boolean,
  onRenameBranch?: (branchName: string) => void,
  onDeleteBranch?: (branchName: string) => void
): IMenuItem[] {
  const items: Array<IMenuItem> = []

  if (onRenameBranch !== undefined) {
    items.push({
      label: 'Rename…',
      action: () => onRenameBranch(name),
      enabled: isLocal,
    })
  }

  items.push({
    label: __DARWIN__ ? 'Copy Branch Name' : 'Copy branch name',
    action: () => clipboard.writeText(name),
  })

  items.push({ type: 'separator' })

  if (onDeleteBranch !== undefined) {
    items.push({
      label: 'Delete…',
      action: () => onDeleteBranch(name),
    })
  }

  return items
}

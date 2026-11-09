/** Branch permissions inferred by the shared Rust service from local Git metadata. */
export interface IBranchPermissions {
  readonly name: string
  readonly reference: string
  readonly is_default: boolean
  readonly published: boolean
  readonly can_delete: boolean
  readonly can_rename: boolean
  readonly delete_reason: string | null
  readonly rename_reason: string | null
}
/** Validate permissions before using them to enable a branch action. */
export function isBranchPermissions(
  value: unknown
): value is IBranchPermissions {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    return false
  return (
    ['name', 'reference'].every(
      key => typeof Reflect.get(value, key) === 'string'
    ) &&
    ['is_default', 'published', 'can_delete', 'can_rename'].every(
      key => typeof Reflect.get(value, key) === 'boolean'
    ) &&
    ['delete_reason', 'rename_reason'].every(
      key =>
        Reflect.get(value, key) === null ||
        typeof Reflect.get(value, key) === 'string'
    )
  )
}

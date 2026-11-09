import * as React from 'react'

export interface ILfsPreview {
  readonly oid: string
  readonly size: number
  readonly state: string
}
const messages: Record<string, string> = {
  available: 'Verified local payload.',
  missing: 'Payload is not cached locally. Fetch the LFS objects, then reload.',
  corrupt:
    'Cached payload failed verification. Repair the local LFS cache, then reload.',
  unavailable:
    'Local payload is unavailable. Check Git LFS installation and cache access.',
  extension:
    'This pointer requires an LFS extension. Its preview and partial selection are unavailable.',
  too_large:
    'Payload exceeds the preview limit. Whole-file actions remain available.',
}
/** Validate optional payload metadata received from the repository service. */
export function lfsPreview(value: unknown): value is ILfsPreview {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    return false
  if (!('oid' in value) || !('size' in value) || !('state' in value))
    return false
  const item = value
  return (
    typeof item.oid === 'string' &&
    /^[0-9a-f]{64}$/.test(item.oid) &&
    typeof item.size === 'number' &&
    Number.isFinite(item.size) &&
    item.size >= 0 &&
    typeof item.state === 'string' &&
    Object.prototype.hasOwnProperty.call(messages, item.state)
  )
}
/** Explain verified or unavailable LFS content without exposing cache paths. */
export function LfsNotice({
  label,
  value,
}: {
  readonly label: string
  readonly value?: ILfsPreview
}) {
  if (!value) return null
  return (
    <p className="lfs-preview">
      <strong>{label} · Git LFS</strong> · {value.size} bytes ·{' '}
      <code>{value.oid.slice(0, 12)}</code>
      <br />
      {messages[value.state]}
    </p>
  )
}

import * as React from 'react'

interface IRepositoryIdentity {
  readonly host: string
  readonly owner: string
  readonly name: string
}
interface INameRuleFailure {
  readonly ruleset_id: number
  readonly description: string
}
/** The server's repository and actor bound review of one branch name. */
export interface INameRulesPolicy {
  readonly basis: string
  readonly branch: string
  readonly status: 'checked' | 'skipped' | 'unavailable'
  readonly result: 'pass' | 'warning' | 'blocked' | 'not_checked'
  readonly reason: string | null
  readonly repository: IRepositoryIdentity | null
  readonly actor: { readonly id: number; readonly login: string } | null
  readonly creation_restricted: 'none' | 'bypass' | 'enforced'
  readonly failed: ReadonlyArray<INameRuleFailure>
  readonly bypassed: ReadonlyArray<INameRuleFailure>
}
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
function text(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}
function identifier(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
}
function failures(value: unknown): value is ReadonlyArray<INameRuleFailure> {
  return (
    Array.isArray(value) &&
    value.every(
      item =>
        record(item) &&
        identifier(item.ruleset_id) &&
        typeof item.description === 'string'
    )
  )
}
/** Validate optional server policy before using it to enable a mutation. */
export function isNameRulesPolicy(value: unknown): value is INameRulesPolicy {
  return (
    record(value) &&
    text(value.basis) &&
    text(value.branch) &&
    typeof value.status === 'string' &&
    ['checked', 'skipped', 'unavailable'].includes(value.status) &&
    typeof value.result === 'string' &&
    ['pass', 'warning', 'blocked', 'not_checked'].includes(value.result) &&
    (value.reason === null || typeof value.reason === 'string') &&
    (value.repository === null ||
      (record(value.repository) &&
        text(value.repository.host) &&
        text(value.repository.owner) &&
        text(value.repository.name))) &&
    (value.actor === null ||
      (record(value.actor) &&
        identifier(value.actor.id) &&
        text(value.actor.login))) &&
    typeof value.creation_restricted === 'string' &&
    ['none', 'bypass', 'enforced'].includes(value.creation_restricted) &&
    failures(value.failed) &&
    failures(value.bypassed)
  )
}
/** Older reviews may omit policy; present policy must describe the reviewed name. */
export function optionalNameRules(
  value: unknown,
  branch: string
): value is INameRulesPolicy | null | undefined {
  return (
    value === undefined ||
    value === null ||
    (isNameRulesPolicy(value) && value.branch === branch)
  )
}
/** Explain checked, bypassable and unavailable checks without treating missing evidence as a pass. */
export function NameRules({
  policy,
}: {
  readonly policy: INameRulesPolicy | null | undefined
}) {
  if (!policy) return null
  const message =
    policy.status === 'unavailable'
      ? 'GitHub branch name rules could not be checked.'
      : policy.status === 'skipped'
      ? 'GitHub branch name rules were not checked.'
      : policy.result === 'blocked'
      ? 'GitHub repository rules restrict this branch name.'
      : policy.result === 'warning'
      ? 'This branch name conflicts with GitHub rules that your account can bypass.'
      : 'This branch name passes the applicable GitHub rules.'
  return (
    <aside
      aria-label="GitHub branch name rules"
      role={policy.result === 'blocked' ? 'alert' : 'status'}
    >
      <p>{message}</p>
      {policy.reason && <p>{policy.reason}</p>}
      {policy.repository && (
        <p>
          Repository: {policy.repository.host}/{policy.repository.owner}/
          {policy.repository.name}.
        </p>
      )}
      {policy.actor && <p>Checked for {policy.actor.login}.</p>}
      {policy.failed.length > 0 && (
        <ul aria-label="Restricted branch name rules">
          {policy.failed.map((failure, index) => (
            <li key={`${failure.ruleset_id}:${index}`}>
              {failure.description}
            </li>
          ))}
        </ul>
      )}
      {policy.bypassed.length > 0 && (
        <ul aria-label="Bypassable branch name rules">
          {policy.bypassed.map((failure, index) => (
            <li key={`${failure.ruleset_id}:${index}`}>
              {failure.description}
            </li>
          ))}
        </ul>
      )}
    </aside>
  )
}

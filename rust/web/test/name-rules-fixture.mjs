export function nameRules(branch, fields = {}) {
  return {
    basis: 'name-rules-basis',
    branch,
    status: 'checked',
    result: 'pass',
    reason: null,
    repository: { host: 'github.example', owner: 'fork', name: 'repo' },
    actor: { id: 17, login: 'account' },
    creation_restricted: 'none',
    failed: [],
    bypassed: [],
    ...fields,
  }
}

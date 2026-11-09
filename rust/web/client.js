import { connect } from './transport.js'
import {
  mountGitHub,
  mountDiff,
  mountHistory,
  mountRecovery,
  mountManagement,
  mountDiscard,
  mountLfs,
  mountLfsInitialization,
  mountCommit,
  mountStash,
  mountCheckout,
} from './panels.js'

const status = document.querySelector('#connection')
const output = document.querySelector('#output')
const files = document.querySelector('#files')
const branches = document.querySelector('#branches')
const tokenKey = `desktop-session:${location.origin}`
const fragmentToken = new URLSearchParams(location.hash.slice(1)).get('token')
if (fragmentToken) sessionStorage.setItem(tokenKey, fragmentToken)
const token = fragmentToken || sessionStorage.getItem(tokenKey)
history.replaceState(null, '', location.pathname)
let bridge
let githubView
let diffView
let historyView
let recoveryView
let discardView
let commitView
let stashView
let checkoutView
let lfsView
let lfsInitializationView
let managementView
let state
let busy = false
let connected = false
let initialized = false
let actionEpoch = 0
const cancelWork = document.querySelector('#cancel-work')
const reconnect = document.querySelector('#reconnect')

function updateBranchControls() {
  const unavailable =
    busy || !connected || !state || branches.options.length === 0
  branches.disabled = unavailable
  document.querySelector('#checkout').disabled = unavailable
}

function setBusy(value) {
  busy = value
  commitView?.setEnabled(connected && !value)
  stashView?.setEnabled(connected && !value)
  checkoutView?.setEnabled(connected && !value)
  recoveryView?.setEnabled(connected && !value)
  document
    .querySelectorAll('main button, main select, .toolbar button')
    .forEach(control => {
      if (
        control.closest(
          '#history-root, #diff-root, #commit-root, #recovery-root'
        ) ||
        control === cancelWork ||
        control === reconnect
      )
        return
      control.disabled = value || !connected
    })
  if (!state)
    document
      .querySelectorAll(
        '#branches,#checkout,#create-branch button,#commit button,[data-network],[data-view]'
      )
      .forEach(control => {
        control.disabled = true
      })
  updateBranchControls()
}

function button(label, action) {
  const element = document.createElement('button')
  element.textContent = label
  element.disabled = busy
  element.addEventListener('click', action)
  return element
}

function repositoryKey(snapshot) {
  return snapshot?.root_id || snapshot?.root || null
}
function displayPath(path) {
  return typeof path === 'string'
    ? path
    : new TextDecoder().decode(new Uint8Array(path.bytes))
}

function applyPreferences(preferences) {
  document.documentElement.dataset.theme = preferences.theme
  managementView?.setPreferences(preferences)
  checkoutView?.setStrategy(preferences.uncommitted_changes)
}

function render(snapshot) {
  if (repositoryKey(state) !== repositoryKey(snapshot))
    branches.replaceChildren()
  state = snapshot
  updateBranchControls()
  commitView?.setRepository(repositoryKey(snapshot))
  checkoutView?.setSnapshot(
    snapshot ? { root: repositoryKey(snapshot), branch: snapshot.branch } : null
  )
  stashView?.setSnapshot(
    snapshot ? { root: repositoryKey(snapshot), branch: snapshot.branch } : null
  )
  lfsInitializationView?.setRepository(repositoryKey(snapshot))
  lfsView?.setSnapshot(
    snapshot ? { root: repositoryKey(snapshot), files: snapshot.files } : null
  )
  discardView?.setRepository(repositoryKey(snapshot))
  managementView?.setRepository(
    repositoryKey(snapshot),
    snapshot?.repository_account?.basis
  )
  historyView?.setRepository(repositoryKey(snapshot))
  recoveryView?.setSnapshot(
    snapshot ? { ...snapshot, root: repositoryKey(snapshot) } : null
  )
  githubView?.setRepository(
    repositoryKey(snapshot),
    snapshot?.repository_account?.basis
  )
  diffView?.setRepository(repositoryKey(snapshot))
  if (!snapshot) {
    document.querySelector('#repository').textContent =
      'Open, initialize, or clone a repository'
    document.querySelector('#branch').textContent = '—'
    files.textContent = 'No repository selected'
    branches.replaceChildren()
    return
  }
  document.querySelector('#repository').textContent = snapshot.root
  document.querySelector('#branch').textContent =
    snapshot.branch || `Detached at ${(snapshot.head || '').slice(0, 8)}`
  files.replaceChildren()
  for (const file of snapshot.files) {
    const row = document.createElement('div')
    row.className = file.conflicted ? 'file conflict' : 'file'
    const name = button(
      `${file.index}${file.worktree}  ${file.display_path}`,
      () => showDiff(file.path, false, file.display_path)
    )
    name.className = 'file-name'
    row.append(name)
    const actions = document.createElement('div')
    actions.className = 'file-actions'
    if (file.worktree !== ' ' || file.index === '?')
      actions.append(
        button('Stage', () => mutate('stage', { paths: [file.path] }))
      )
    if (file.index !== ' ' && file.index !== '?') {
      actions.append(
        button('Unstage', () => mutate('unstage', { paths: [file.path] }))
      )
      actions.append(
        button('Staged diff', () =>
          showDiff(file.path, true, file.display_path)
        )
      )
    }
    if (file.conflicted)
      actions.append(document.createTextNode('Resolve conflict, then stage'))
    actions.append(
      button('Discard…', () =>
        discardView.showFile(file.path, file.display_path, repositoryKey(state))
      )
    )
    row.append(actions)
    files.append(row)
  }
  if (!snapshot.files.length) files.textContent = 'No local changes'
}

async function request(method, parameters = {}) {
  const result = await bridge.request(method, {
    repository_id: repositoryKey(state),
    ...parameters,
  })
  if (
    result &&
    result.code !== undefined &&
    result.code !== 0 &&
    result.requires_confirmation !== true
  )
    throw new Error(
      result.stderr || result.stdout || `Git exited ${result.code}`
    )
  return result
}

async function refresh() {
  render(await request('snapshot'))
  const saved = await request('list_repositories')
  const select = document.querySelector('#repositories')
  select.replaceChildren()
  for (const path of saved.repositories) {
    const option = document.createElement('option')
    option.value = JSON.stringify(path)
    option.textContent = displayPath(path)
    option.selected = JSON.stringify(path) === JSON.stringify(saved.selected)
    select.append(option)
  }
  if (!state) return
  const root = repositoryKey(state)
  const result = await request('branch_list')
  if (root !== repositoryKey(state)) return
  branches.replaceChildren()
  for (const branch of result.filter(
    branch => branch.local || !branch.name.endsWith('/HEAD')
  )) {
    const option = document.createElement('option')
    option.value = branch.ref
    option.textContent = branch.local ? branch.name : `${branch.name} (remote)`
    option.selected = branch.local && branch.name === state.branch
    branches.append(option)
  }
  updateBranchControls()
}

async function perform(action) {
  if (busy) return
  const epoch = ++actionEpoch
  setBusy(true)
  status.textContent = 'Working…'
  try {
    await action()
    if (epoch === actionEpoch) status.textContent = 'Ready'
  } catch (error) {
    if (epoch === actionEpoch) status.textContent = error.message
  } finally {
    if (epoch === actionEpoch) setBusy(false)
  }
}

async function mutate(method, parameters = {}) {
  return perform(async () => {
    const result = await request(method, parameters)
    diffView.clear()
    output.hidden = false
    output.textContent = (result.stdout || '') + (result.stderr || '')
    await refresh()
  })
}

async function showDiff(path, staged, name) {
  if (!state) return
  historyView.clear()
  output.hidden = true
  document.querySelector('#detail-title').textContent = 'File diff'
  diffView.showFile(path, staged, name, repositoryKey(state))
}

async function start() {
  if (!token)
    throw new Error('Open the full session URL printed by desktop-rs serve.')
  bridge = connect(token, event => {
    if (event.event === 'preferences_changed')
      applyPreferences(event.preferences)
    if (event.event === 'repository_changed') {
      render(event.snapshot)
      if (connected && !busy) perform(refresh)
    }
    if (event.event === 'requests_changed') {
      cancelWork.disabled = !connected || !event.cancellable
      cancelWork.textContent = event.count
        ? `Cancel work (${event.count})`
        : 'Cancel work'
    }
    if (event.event === 'disconnected') {
      ++actionEpoch
      connected = false
      render(null)
      setBusy(false)
      cancelWork.disabled = true
      reconnect.hidden = event.terminal || event.closed
      reconnect.disabled = false
      status.textContent = event.terminal
        ? 'Session expired. Open the new session URL.'
        : 'Disconnected. Work may have completed; reconnect to refresh state.'
    }
    if (event.event === 'reconnecting') status.textContent = 'Reconnecting…'
    if (event.event === 'connected') {
      reconnect.hidden = true
      if (initialized) {
        connected = true
        setBusy(false)
        perform(async () => {
          applyPreferences(await request('get_preferences'))
          await refresh()
        })
      }
    }
  })
  let storedPreferences
  while (true) {
    await bridge.whenConnected()
    try {
      storedPreferences = await request('get_preferences')
      break
    } catch (error) {
      if (error.code !== 'disconnected') throw error
    }
  }
  applyPreferences(storedPreferences)
  connected = true
  managementView = mountManagement(document.querySelector('#management-root'), {
    request,
    onChanged: refresh,
    onPreferences: applyPreferences,
    async openWorktree(path) {
      await request('open_worktree', { path })
      await refresh()
    },
  })
  managementView.setPreferences(storedPreferences)
  recoveryView = mountRecovery(document.querySelector('#recovery-root'), {
    request,
    onBusy: setBusy,
    async onChanged() {
      diffView?.clear()
      historyView?.clear()
      await refresh()
      discardView?.refreshHistory()
      checkoutView?.refreshHistory()
      stashView?.refreshHistory()
    },
  })
  historyView = mountHistory(document.querySelector('#history-root'), {
    request,
    onChanged: refresh,
    onDiff(path, commit, parent, name) {
      output.hidden = true
      diffView.showCommit(path, commit, parent, name, repositoryKey(state))
    },
  })
  checkoutView = mountCheckout(document.querySelector('#checkout-root'), {
    request,
    onBusy: setBusy,
    onPreferences: applyPreferences,
    async onChanged() {
      diffView?.clear()
      historyView?.clear()
      await refresh()
      stashView?.refreshHistory()
      recoveryView?.clearResolutionUndo()
    },
    onStashes() {
      stashView?.refreshHistory()
      document.querySelector('#stash-root').scrollIntoView?.({ block: 'start' })
    },
    async openWorktree(path) {
      await request('open_worktree', { path })
      await refresh()
    },
  })
  checkoutView.setStrategy(storedPreferences.uncommitted_changes)
  stashView = mountStash(document.querySelector('#stash-root'), {
    request,
    async onChanged() {
      await refresh()
      checkoutView?.refreshHistory()
    },
    onDiff(path, commit, parent, name, root) {
      if (root !== repositoryKey(state)) return
      output.hidden = true
      diffView.showCommit(path, commit, parent, name, root)
    },
  })
  commitView = mountCommit(document.querySelector('#commit-root'), {
    request,
    onChanged: refresh,
  })
  lfsInitializationView = mountLfsInitialization(
    document.querySelector('#lfs-initialization-root'),
    { request, onChanged: refresh }
  )
  lfsView = mountLfs(document.querySelector('#lfs-root'), {
    request,
    onChanged: refresh,
  })
  discardView = mountDiscard(document.querySelector('#discard-root'), {
    request,
    async onChanged() {
      diffView?.clear()
      await refresh()
      recoveryView?.clearResolutionUndo()
    },
  })
  diffView = mountDiff(document.querySelector('#diff-root'), {
    request,
    onDiscard: (path, name, root, selection) =>
      discardView.showFile(path, name, root, selection),
    onChanged: refresh,
  })
  githubView = mountGitHub(document.querySelector('#github-root'), {
    request: request =>
      bridge.request('github', {
        request,
        repository_id: repositoryKey(state),
      }),
    onChanged: refresh,
  })
  document.querySelector('#select-repository').addEventListener('click', () => {
    const value = document.querySelector('#repositories').value
    if (!value) {
      status.textContent = 'Choose a saved repository first'
      return
    }
    mutate('select_repository', { path: JSON.parse(value) })
  })
  for (const [selector, method] of [
    ['#open-repository', 'open_repository'],
    ['#init-repository', 'init_repository'],
    ['#clone-repository', 'clone_repository'],
  ]) {
    document.querySelector(selector).addEventListener('submit', event => {
      event.preventDefault()
      mutate(method, Object.fromEntries(new FormData(event.currentTarget)))
    })
  }
  document
    .querySelector('#refresh')
    .addEventListener('click', () => perform(refresh))
  document
    .querySelector('#checkout')
    .addEventListener('click', () => checkoutView.review(branches.value))
  document.querySelector('#create-branch').addEventListener('submit', event => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    checkoutView.create(String(data.get('name')), {
      start_point: String(data.get('start_point') || '') || null,
      no_track: data.has('no_track'),
      checkout: data.has('checkout'),
    })
  })
  document.querySelectorAll('[data-network]').forEach(control =>
    control.addEventListener('click', () => {
      const method = control.dataset.network
      if (!state || (method !== 'fetch' && !state.branch)) {
        status.textContent = 'Select a branch first'
        return
      }
      const parameters = { remote: document.querySelector('#remote').value }
      if (method !== 'fetch') parameters.branch = state.branch
      if (method === 'push') parameters.set_upstream = true
      mutate(method, parameters)
    })
  )
  document.querySelectorAll('[data-view]').forEach(control =>
    control.addEventListener('click', () =>
      perform(async () => {
        if (control.dataset.view === 'changes') {
          await refresh()
          return
        }
        if (control.dataset.view === 'log') {
          diffView.clear()
          output.hidden = true
          historyView.show(repositoryKey(state))
          return
        }
        historyView.clear()
        diffView.clear()
        output.hidden = false
        const result = await request(control.dataset.view)
        document.querySelector('#detail-title').textContent =
          control.textContent
        output.textContent = (result.stdout || '') + (result.stderr || '')
      })
    )
  )
  initialized = true
  cancelWork.addEventListener('click', async () => {
    const epoch = ++actionEpoch
    setBusy(true)
    cancelWork.disabled = true
    status.textContent = 'Cancelling work…'
    await bridge.cancelPending()
    if (epoch !== actionEpoch || !connected) return
    try {
      await refresh()
      if (epoch === actionEpoch)
        status.textContent =
          'Cancelled. State refreshed; completed changes remain.'
    } catch (error) {
      if (epoch === actionEpoch) status.textContent = error.message
    } finally {
      if (epoch === actionEpoch) setBusy(false)
    }
  })
  reconnect.addEventListener('click', () => {
    reconnect.disabled = true
    bridge.reconnect().catch(error => {
      status.textContent = error.message
      reconnect.disabled = false
    })
  })
  await perform(refresh)
}

start().catch(error => {
  status.textContent = error.message
})

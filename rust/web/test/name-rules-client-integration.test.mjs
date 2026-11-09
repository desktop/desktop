import assert from 'node:assert/strict'
import { test } from 'node:test'
import { spawn, spawnSync } from 'node:child_process'
import { once } from 'node:events'
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  rename,
  readdir,
  access,
  rm,
} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { JSDOM, VirtualConsole } from 'jsdom'
import WebSocket from 'ws'

const root = fileURLToPath(new URL('../../..', import.meta.url)),
  binary = path.join(root, 'rust/target/debug/desktop-rs')
const privateToken = 'name-rule-fixture-private-token-145e'
async function until(check, label) {
  const deadline = performance.now() + 12000
  while (performance.now() < deadline) {
    if (await check()) return
    await new Promise(resolve => setTimeout(resolve, 25))
  }
  throw new Error(typeof label === 'function' ? label() : label)
}
function button(container, label) {
  return [...container.querySelectorAll('button')].find(
    value => value.textContent === label
  )
}
const shellQuote = value => "'" + value.replaceAll("'", "'\\''") + "'"

test('production localhost branch creation and rename enforce checked rules, review bypasses and reject changed policy without replay', async () => {
  const temporary = await mkdtemp(
      path.join(os.tmpdir(), 'desktop-name-rules-client-')
    ),
    repo = path.join(temporary, 'repository with spaces'),
    config = path.join(temporary, 'repositories.json'),
    tools = path.join(temporary, 'bin'),
    scenario = path.join(temporary, 'scenario.json'),
    transfers = path.join(temporary, 'forbidden-transfer')
  const resolved = spawnSync(
    'python3',
    [
      '-c',
      'import json,shutil,sys;print(json.dumps([sys.executable,shutil.which("git")]))',
    ],
    { encoding: 'utf8' }
  )
  assert.equal(resolved.status, 0, resolved.stderr)
  const [python, realGit] = JSON.parse(resolved.stdout)
  assert(realGit)
  const shell = spawnSync(realGit, ['var', 'GIT_SHELL_PATH'], {
    encoding: 'utf8',
  })
  assert.equal(shell.status, 0, shell.stderr)
  const env = {
    ...process.env,
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: path.join(temporary, 'global'),
    GIT_OPTIONAL_LOCKS: '0',
    GH_CONFIG_DIR: path.join(temporary, 'gh-config'),
    NAME_RULE_SCENARIO: scenario,
    PATH: [tools, process.env.PATH].join(path.delimiter),
  }
  for (const key of [
    'GH_TOKEN',
    'GITHUB_TOKEN',
    'GH_ENTERPRISE_TOKEN',
    'GITHUB_ENTERPRISE_TOKEN',
    'GH_REPO',
  ])
    delete env[key]
  const calls = [],
    sockets = [],
    errors = []
  let server, dom
  function git(...args) {
    const result = spawnSync(realGit, ['-C', repo, ...args], {
      env,
      encoding: 'utf8',
    })
    assert.equal(result.status, 0, result.stderr)
    return result.stdout
  }
  function exists(name) {
    return (
      spawnSync(
        realGit,
        ['-C', repo, 'show-ref', '--verify', '--quiet', 'refs/heads/' + name],
        { env }
      ).status === 0
    )
  }
  async function receipts(directory) {
    try {
      return (await readdir(path.join(repo, '.git', directory))).sort()
    } catch (error) {
      if (error.code === 'ENOENT') return []
      throw error
    }
  }
  async function mode(value) {
    await writeFile(scenario + '.next', JSON.stringify({ mode: value }), {
      mode: 0o600,
    })
    await rename(scenario + '.next', scenario)
  }
  async function files() {
    return {
      index: await readFile(path.join(repo, '.git/index')),
      working: await readFile(path.join(repo, 'file.txt')),
      loose: await readFile(path.join(repo, 'untracked.bin')),
    }
  }
  try {
    await mkdir(repo)
    await mkdir(tools)
    await mode('blocked')
    await writeFile(
      path.join(tools, 'gh'),
      `#!${python}\nimport json,os,sys\nfrom pathlib import Path\na=sys.argv[1:];mode=json.loads(Path(os.environ['NAME_RULE_SCENARIO']).read_text())['mode']\nif a[:2]==['repo','view']:\n print(json.dumps({'nameWithOwner':'fork/repo','url':'https://github.com/fork/repo','isFork':False,'parent':None}));sys.exit(0)\nif a[:2]==['auth','token']:\n if mode=='skipped':sys.exit(4)\n print(${JSON.stringify(
        privateToken
      )});sys.exit(0)\nif a and a[0]=='api':\n if '--method' not in a or a[a.index('--method')+1]!='GET' or os.environ.get('GH_TOKEN')!=${JSON.stringify(
        privateToken
      )}:\n  sys.stderr.write('Invalid private fixture API session');sys.exit(2)\n endpoint=a[-1].split('?')[0]\n if endpoint=='/user':data={'id':1,'login':'tester','plan':{'name':'pro'}}\n elif endpoint=='/repos/fork/repo':data={'id':7,'full_name':'fork/repo','name':'repo','owner':{'login':'fork'},'html_url':'https://github.com/fork/repo','private':False}\n elif endpoint.startswith('/repos/fork/repo/rules/branches/'):\n  if mode=='unavailable':sys.stderr.write('Fixture API unavailable');sys.exit(1)\n  data=[] if mode=='allowed' else [{'ruleset_id':1,'type':'branch_name_pattern','parameters':{'name':'fixture','operator':'starts_with','pattern':'allowed/','negate':False}}]\n elif endpoint=='/repos/fork/repo/rulesets/1':data={'id':1,'current_user_can_bypass':'always' if mode=='bypass' else 'never'}\n else:sys.stderr.write('Unexpected fixture API endpoint');sys.exit(2)\n print(json.dumps(data));sys.exit(0)\nprint('{"hosts":{}}');sys.exit(4)\n`,
      { mode: 0o700 }
    )
    await writeFile(
      path.join(tools, 'git'),
      `#!${shell.stdout.trim()}\ncommand=\nskip=0\nfor argument do\n if [ "$skip" = 1 ]; then skip=0; continue; fi\n case "$argument" in\n -c|-C|--git-dir|--work-tree|--namespace) skip=1 ;;\n --no-pager|--paginate|--literal-pathspecs|--no-optional-locks|--git-dir=*|--work-tree=*) ;;\n *) command="$argument"; break ;;\n esac\ndone\nforbidden=0\ncase "$command" in fetch|push|pull|clone) forbidden=1 ;;\nls-remote) forbidden=1; for argument do [ "$argument" = --get-url ] && forbidden=0; done ;;\nremote) for argument do case "$argument" in update|prune|--fetch|-f) forbidden=1 ;; esac; done ;;\nesac\nif [ "$forbidden" = 1 ]; then printf forbidden > ${shellQuote(
        transfers
      )}; printf 'Git transfer forbidden by branch-rule fixture\\n' >&2; exit 97; fi\nexec ${shellQuote(
        realGit
      )} "$@"\n`,
      { mode: 0o700 }
    )
    git('init', '-qb', 'main')
    git('config', 'user.name', 'Name Rule Browser')
    git('config', 'user.email', 'name-rules@example.invalid')
    git('config', 'commit.gpgsign', 'false')
    await writeFile(path.join(repo, 'file.txt'), 'base\n')
    git('add', '--', 'file.txt')
    git('commit', '-qm', 'base')
    git('remote', 'add', 'origin', 'https://github.com/fork/repo.git')
    await writeFile(path.join(repo, 'file.txt'), 'staged bytes\n')
    git('add', '--', 'file.txt')
    await writeFile(path.join(repo, 'file.txt'), 'working bytes\n')
    await writeFile(path.join(repo, 'untracked.bin'), Buffer.from([0, 255, 10]))
    const before = await files(),
      initialRefs = git('for-each-ref', '--format=%(refname)%00%(objectname)')
    const seeded = spawnSync(
      binary,
      ['-C', repo, 'repository-context', '--refresh'],
      { env, encoding: 'utf8' }
    )
    assert.equal(seeded.status, 0, seeded.stderr)
    assert.equal(JSON.parse(seeded.stdout).status, 'verified')
    server = spawn(
      binary,
      ['-C', repo, '--config', config, 'serve', '--port', '0'],
      { env, stdio: ['ignore', 'ignore', 'pipe'] }
    )
    let output = ''
    server.stderr.on('data', data => {
      output += data.toString()
    })
    await until(
      () => output.includes('Open http://'),
      'name-rule fixture bridge did not start'
    )
    const url = /Open (http:\/\/[^\s]+)/.exec(output)[1],
      html = await (await fetch(url.split('#')[0])).text()
    const bundled = await build({
      entryPoints: [path.join(root, 'rust/web/client.js')],
      bundle: true,
      write: false,
      format: 'iife',
      logLevel: 'silent',
    })
    const virtualConsole = new VirtualConsole()
    virtualConsole.on('jsdomError', error => errors.push(error))
    class BrowserSocket extends WebSocket {
      constructor(address) {
        super(address, {
          origin: new URL(address).origin.replace('ws:', 'http:'),
        })
        sockets.push(this)
      }
      send(data, ...args) {
        calls.push(JSON.parse(data))
        return super.send(data, ...args)
      }
    }
    dom = new JSDOM(html, {
      url,
      runScripts: 'outside-only',
      pretendToBeVisual: true,
      virtualConsole,
    })
    dom.window.TextEncoder = globalThis.TextEncoder
    dom.window.WebSocket = BrowserSocket
    dom.window.eval(bundled.outputFiles[0].text)
    const document = dom.window.document
    await until(
      () =>
        document.querySelector('#connection').textContent === 'Ready' &&
        !document.querySelector('#create-branch button').disabled,
      'name-rule client did not initialize'
    )
    const form = document.querySelector('#create-branch'),
      checkout = document.querySelector('.checkout-panel'),
      renamePanel = document.querySelector('.branch-rename')
    function setInput(element, value) {
      Object.getOwnPropertyDescriptor(
        dom.window.HTMLInputElement.prototype,
        'value'
      ).set.call(element, value)
      element.dispatchEvent(new dom.window.Event('input', { bubbles: true }))
    }
    function rules(container) {
      return container.querySelector('[aria-label="GitHub branch name rules"]')
    }
    async function createReview(name) {
      await until(
        () => !form.querySelector('button').disabled,
        'new branch form was not ready'
      )
      setInput(form.elements.namedItem('name'), name)
      setInput(form.elements.namedItem('start_point'), '')
      if (form.elements.namedItem('checkout').checked)
        form.elements.namedItem('checkout').click()
      const previousPreviews = calls.filter(
        call => call.method === 'create_branch_preview'
      ).length
      form.dispatchEvent(
        new dom.window.Event('submit', { bubbles: true, cancelable: true })
      )
      await until(
        () =>
          calls.filter(call => call.method === 'create_branch_preview').length >
            previousPreviews &&
          checkout.textContent.includes('Create ' + name) &&
          rules(checkout) &&
          !button(checkout, 'Refresh branch switch review').disabled,
        () => 'creation policy review did not load: ' + checkout.textContent
      )
    }
    async function renameReview(name) {
      await until(
        () => !button(renamePanel, 'Review branch rename').disabled,
        'rename form was not ready'
      )
      setInput(renamePanel.querySelector('input'), name)
      const previousPreviews = calls.filter(
        call => call.method === 'rename_branch_preview'
      ).length
      button(renamePanel, 'Review branch rename')
        .closest('form')
        .dispatchEvent(
          new dom.window.Event('submit', { bubbles: true, cancelable: true })
        )
      await until(
        () =>
          calls.filter(call => call.method === 'rename_branch_preview').length >
            previousPreviews &&
          button(renamePanel, 'Confirm branch rename') &&
          rules(renamePanel) &&
          !button(renamePanel, 'Review branch rename').disabled,
        () => 'rename policy review did not load: ' + renamePanel.textContent
      )
    }
    await createReview('topic-created')
    assert(
      rules(checkout).textContent.includes(
        'GitHub repository rules restrict this branch name'
      )
    )
    assert(
      !button(checkout, 'Create branch') ||
        button(checkout, 'Create branch').disabled
    )
    assert.equal(exists('topic-created'), false)
    assert.equal(
      calls.filter(call => call.method === 'create_branch').length,
      0
    )
    assert.deepEqual(await receipts('desktop-checkout'), [])
    assert.equal(
      git('for-each-ref', '--format=%(refname)%00%(objectname)'),
      initialRefs
    )
    assert.deepEqual(await files(), before)
    await mode('bypass')
    await createReview('topic-created')
    assert(rules(checkout).textContent.includes('your account can bypass'))
    assert(!button(checkout, 'Create branch').disabled)
    button(checkout, 'Create branch').click()
    await until(
      () =>
        exists('topic-created') &&
        checkout.textContent.includes('Branch created') &&
        !form.querySelector('button').disabled,
      () => 'bypassed creation did not finish: ' + checkout.textContent
    )
    const creation = calls.find(call => call.method === 'create_branch')
    assert.deepEqual(Object.keys(creation).sort(), [
      'basis',
      'checkout',
      'id',
      'method',
      'name',
      'no_track',
      'replace_stash',
      'repository_id',
      'restore_index',
      'start_point',
      'strategy',
    ])
    assert.equal(creation.name, 'topic-created')
    assert.equal(creation.checkout, false)
    assert.equal(typeof creation.basis, 'string')
    assert.deepEqual(await files(), before)
    const existingReceipts = await receipts('desktop-checkout'),
      afterCreateRefs = git(
        'for-each-ref',
        '--format=%(refname)%00%(objectname)'
      )
    await mode('allowed')
    await createReview('stale-topic')
    assert(
      rules(checkout).textContent.includes('passes the applicable GitHub rules')
    )
    await mode('blocked')
    button(checkout, 'Create branch').click()
    await until(
      () =>
        checkout.textContent.includes('review again') &&
        !button(checkout, 'Refresh branch switch review').disabled,
      () => 'changed policy was not rejected: ' + checkout.textContent
    )
    assert.equal(exists('stale-topic'), false)
    assert.deepEqual(await receipts('desktop-checkout'), existingReceipts)
    assert.equal(
      git('for-each-ref', '--format=%(refname)%00%(objectname)'),
      afterCreateRefs
    )
    button(checkout, 'Refresh branch switch review').click()
    await until(
      () =>
        rules(checkout)?.textContent.includes(
          'GitHub repository rules restrict this branch name'
        ) && !button(checkout, 'Refresh branch switch review').disabled,
      () => 'changed policy review did not refresh: ' + checkout.textContent
    )
    assert(button(checkout, 'Create branch').disabled)
    assert.equal(
      calls.filter(call => call.method === 'create_branch').length,
      2,
      'changed policy replayed creation'
    )
    await renameReview('renamed-topic')
    assert(
      rules(renamePanel).textContent.includes(
        'GitHub repository rules restrict this branch name'
      )
    )
    assert(button(renamePanel, 'Confirm branch rename').disabled)
    assert.deepEqual(await receipts('desktop-branch-renames'), [])
    assert.equal(
      calls.filter(call => call.method === 'rename_branch').length,
      0
    )
    await mode('allowed')
    await renameReview('renamed-topic')
    assert(
      rules(renamePanel).textContent.includes(
        'passes the applicable GitHub rules'
      )
    )
    button(renamePanel, 'Confirm branch rename').click()
    await until(
      () =>
        document.querySelector('#branch').textContent === 'renamed-topic' &&
        !document.querySelector('#checkout').disabled,
      'allowed rename did not finish'
    )
    assert.equal(exists('main'), false)
    assert.equal(exists('renamed-topic'), true)
    assert.deepEqual(
      Object.keys(calls.find(call => call.method === 'rename_branch')).sort(),
      ['basis', 'id', 'method', 'name', 'new_name', 'repository_id']
    )
    assert.deepEqual(await files(), before)
    await mode('skipped')
    await createReview('skipped-preview')
    assert(
      rules(checkout).textContent.includes(
        'GitHub branch name rules were not checked'
      )
    )
    assert(!rules(checkout).textContent.includes('passes the applicable'))
    button(checkout, 'Cancel branch switch').click()
    await mode('unavailable')
    await createReview('unavailable-preview')
    assert(
      rules(checkout).textContent.includes(
        'GitHub branch name rules could not be checked'
      )
    )
    assert(!rules(checkout).textContent.includes('passes the applicable'))
    button(checkout, 'Cancel branch switch').click()
    assert.equal(
      calls.filter(call => call.method === 'create_branch').length,
      2
    )
    assert.equal(
      calls.filter(call => call.method === 'rename_branch').length,
      1
    )
    assert.equal(exists('skipped-preview'), false)
    assert.equal(exists('unavailable-preview'), false)
    assert.deepEqual(await files(), before)
    assert(!document.body.textContent.includes(privateToken))
    assert(!JSON.stringify(calls).includes(privateToken))
    assert.equal(
      calls.some(call => ['fetch', 'push'].includes(call.method)),
      false
    )
    await assert.rejects(access(transfers), { code: 'ENOENT' })
    assert.equal(
      errors.length,
      0,
      errors.map(error => error.message).join('\n')
    )
  } finally {
    if (server && server.exitCode === null) {
      server.kill('SIGINT')
      const timer = setTimeout(() => {
        if (server.exitCode === null) server.kill('SIGKILL')
      }, 6000)
      try {
        await once(server, 'exit')
      } finally {
        clearTimeout(timer)
      }
    }
    await Promise.all(
      sockets.map(socket => {
        if (socket.readyState === WebSocket.CLOSED) return Promise.resolve()
        return new Promise(resolve => {
          socket.once('close', resolve)
          socket.terminate()
        })
      })
    )
    dom?.window.close()
    await rm(temporary, { recursive: true, force: true })
  }
})

import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import esbuild from '../../web/node_modules/esbuild/lib/main.js'
import ts from '../../web/node_modules/typescript/lib/typescript.js'

const here = path.dirname(fileURLToPath(import.meta.url)),
  root = path.resolve(here, '../../..'),
  require = createRequire(import.meta.url)
const files = {
  matcher: 'rust/web/src/upstream/repo-rules-matcher.ts',
  sharedModel: 'rust/web/src/upstream/models/repo-rules.ts',
  checker: 'app/src/ui/lib/branch-name-rule-validation.tsx',
  helper: 'app/src/lib/helpers/repo-rules.ts',
  model: 'app/src/models/repo-rules.ts',
  api: 'app/src/lib/api.ts',
  repository: 'app/src/models/repository.ts',
  account: 'app/src/models/account.ts',
  getAccount: 'app/src/lib/get-account-for-repository.ts',
  endpoint: 'app/src/lib/endpoint-capabilities.ts',
  fatal: 'app/src/lib/fatal-error.ts',
}
const sources = Object.fromEntries(
  await Promise.all(
    Object.entries(files).map(async ([key, filename]) => [
      key,
      await readFile(path.join(root, filename), 'utf8'),
    ])
  )
)
const trees = Object.fromEntries(
  Object.entries(sources).map(([key, source]) => [
    key,
    ts.createSourceFile(files[key], source, ts.ScriptTarget.Latest, true),
  ])
)
function declaration(key, name) {
  const found = trees[key].statements.find(node => node.name?.text === name)
  assert(found, `Missing authoritative declaration ${name} in ${files[key]}`)
  return found.getText(trees[key])
}
function method(name) {
  const api = trees.api.statements.find(
    node => ts.isClassDeclaration(node) && node.name?.text === 'API'
  )
  const found = api?.members.find(
    node => node.name?.getText(trees.api) === name
  )
  assert(found, `Missing authoritative API method ${name}`)
  return found.getText(trees.api)
}
const boundary = 'globalThis.__desktopBranchRulesOracle'
const modules = {
  api: `${declaration('api', 'APIRepoRuleType')}\n${declaration(
    'api',
    'APIRepoRuleMetadataOperator'
  )}\nconst envEndpoint = undefined;\n${declaration(
    'api',
    'getDotComAPIEndpoint'
  )}\nconst log={info:(...args)=>${boundary}.logs.push(args[0])};\nconst parsedResponse=async response=>response;\nconst isRulesetsNotEnabledError=error=>error.kind==='rules_disabled';\nconst isNotFoundApiError=error=>error.kind==='not_found';\nexport class API { static fromAccount(account){return new API()} async ghRequest(verb,requestPath){ const state=${boundary};state.apiCalls.push({method:verb,path:requestPath});if(state.input.api_error)throw Object.assign(new Error('fixture API failure'),{kind:state.input.api_error});return state.input.rules??[]; } ${method(
    'fetchRepoRulesForBranch'
  )} }`,
  repository: `export class Repository {}\nexport class GitHubRepository {constructor(fields){Object.assign(this,fields)}}\n${declaration(
    'repository',
    'isRepositoryWithGitHubRepository'
  )}\n${declaration('repository', 'getRepositoryAccountIdentity')}`,
  account: `${declaration('account', 'getAccountKey')}\n${declaration(
    'account',
    'isSameAccount'
  )}`,
  getAccount: `import {getRepositoryAccountIdentity} from 'oracle:repository';import {isSameAccount} from 'oracle:account';\n${declaration(
    'getAccount',
    'getAccountForRepository'
  )}`,
  git: `export async function getBooleanConfigValue(repository,key){const state=${boundary};state.gitReads.push(key);return state.input.signing_enabled??false}`,
  ui: 'export function createElement(){throw new Error("Oracle attempted UI rendering")} export const Row=createElement,InputError=createElement,InputWarning=createElement;',
}
const aliases = new Map(
  [
    ['app/src/lib/api', 'api'],
    ['app/src/models/repository', 'repository'],
    ['app/src/models/account', 'account'],
    ['app/src/lib/get-account-for-repository', 'getAccount'],
    ['app/src/lib/git', 'git'],
    ['app/src/ui/lib/input-description/input-error', 'ui'],
    ['app/src/ui/lib/input-description/input-warning', 'ui'],
    ['app/src/ui/lib/row', 'ui'],
  ].map(([filename, value]) => [path.join(root, filename), value])
)
const compiled = await esbuild.build({
  absWorkingDir: root,
  stdin: {
    contents: `export {checkBranchNameRules} from './${files.checker}';export {parseRepoRules,useRepoRulesLogic} from './${files.helper}';export {GitHubRepository} from 'oracle:repository';export {toMatcher} from './rust/web/src/upstream/repo-rules-matcher';`,
    loader: 'ts',
    resolveDir: root,
  },
  bundle: true,
  write: false,
  platform: 'node',
  format: 'esm',
  target: 'es2020',
  logLevel: 'silent',
  plugins: [
    {
      name: 'branch-rules-controlled-boundaries',
      setup(build) {
        build.onResolve({ filter: /.*/ }, args => {
          if (args.path.startsWith('oracle:'))
            return { path: args.path.slice(7), namespace: 'oracle' }
          if (args.path === 'react') return { path: 'ui', namespace: 'oracle' }
          if (args.path === 're2js')
            return {
              path: path.join(
                path.dirname(require.resolve('re2js')),
                'index.esm.js'
              ),
            }
          if (args.path === 'semver')
            return { path: require.resolve(args.path) }
          const key = args.path.startsWith('.')
            ? path
                .resolve(args.resolveDir, args.path)
                .replace(/\.(ts|tsx)$/, '')
            : args.path
          const replacement = aliases.get(key)
          return replacement
            ? { path: replacement, namespace: 'oracle' }
            : undefined
        })
        build.onLoad({ filter: /.*/, namespace: 'oracle' }, args => ({
          contents: modules[args.path],
          loader: 'ts',
          resolveDir: root,
        }))
      },
    },
  ],
})
const oracle = await import(
  `data:text/javascript;base64,${Buffer.from(
    compiled.outputFiles[0].text
  ).toString('base64')}`
)
globalThis.localStorage = { getItem: () => null, setItem: () => {} }
function errorValue(error) {
  return { status: 'error', name: error.name, message: error.message }
}
async function evaluate(input) {
  const state = { input, apiCalls: [], gitReads: [], logs: [] }
  globalThis.__desktopBranchRulesOracle = state
  const account =
    input.account === null
      ? null
      : {
          login: 'tester',
          endpoint: 'https://api.github.com',
          plan: 'pro',
          ...input.account,
        }
  const metadata =
    input.github === null
      ? null
      : new oracle.GitHubRepository({
          endpoint: 'https://api.github.com',
          owner: { login: 'owner' },
          name: 'repo',
          isPrivate: false,
          ...input.github,
        })
  const repository = {
    gitHubRepository: metadata,
    login:
      input.assigned_login === undefined
        ? account?.login ?? null
        : input.assigned_login,
  }
  const sets = new Map(
    (input.rulesets ?? []).map(ruleset => [ruleset.id, ruleset])
  )
  let check
  try {
    const result = await oracle.checkBranchNameRules(
      input.branch,
      account ? [account] : [],
      repository,
      sets
    )
    check =
      result === null
        ? { status: 'pass' }
        : {
            status: result.isWarning ? 'warning' : 'blocked',
            message: result.error.message,
          }
  } catch (error) {
    check = errorValue(error)
  }
  const apiCalls = [...state.apiCalls],
    checkGitReads = [...state.gitReads]
  let parsed
  try {
    const result = await oracle.parseRepoRules(
        input.rules ?? [],
        sets,
        repository
      ),
      failures = result.branchNamePatterns.getFailedRules(input.branch)
    parsed = {
      creation_restricted: result.creationRestricted,
      pattern_status: failures.status,
      failed: failures.failed,
      bypassed: failures.bypassed,
    }
  } catch (error) {
    parsed = errorValue(error)
  }
  return {
    id: input.id,
    check,
    parsed,
    api_calls: apiCalls,
    check_git_reads: checkGitReads,
  }
}
const corpus = JSON.parse(await readFile(path.join(here, 'cases.json'), 'utf8'))
assert.equal(corpus.version, 1)
const results = []
for (const input of corpus.cases) {
  const result = await evaluate(input)
  if (input.expected_check)
    assert.equal(result.check.status, input.expected_check, input.id)
  if (input.expected_pattern)
    assert.equal(result.parsed.pattern_status, input.expected_pattern, input.id)
  results.push(result)
}
const current = { version: 1, engine: 're2js@2.0.1', cases: results }
const engineCases = []
const seen = new Set()
for (const input of corpus.cases)
  for (const rule of input.rules ?? []) {
    const parameters = rule.parameters
    if (
      rule.type !== 'branch_name_pattern' ||
      !parameters ||
      typeof parameters.operator !== 'string' ||
      typeof parameters.pattern !== 'string' ||
      typeof parameters.negate !== 'boolean'
    )
      continue
    const key = JSON.stringify([
      parameters.operator,
      parameters.pattern,
      parameters.negate,
      input.branch,
    ])
    if (seen.has(key)) continue
    seen.add(key)
    let outcome
    try {
      outcome = { matched: oracle.toMatcher(parameters)(input.branch) }
    } catch (error) {
      outcome = errorValue(error)
    }
    engineCases.push({
      id: input.id,
      parameters,
      branch: input.branch,
      outcome,
    })
  }
const engineCurrent = { version: 1, engine: 're2js@2.0.1', cases: engineCases }
const mode = process.argv[2] ?? '--check'
if (mode === '--record') {
  await writeFile(
    path.join(here, 'expected.json'),
    JSON.stringify(current, null, 2) + '\n'
  )
  await writeFile(
    path.join(here, 'engine-expected.json'),
    JSON.stringify(engineCurrent, null, 2) + '\n'
  )
  process.stdout.write(
    `Recorded ${results.length} authoritative legacy branch-rule cases.\n`
  )
} else if (mode === '--check') {
  const expected = JSON.parse(
    await readFile(path.join(here, 'expected.json'), 'utf8')
  )
  assert.deepEqual(current, expected)
  assert.deepEqual(
    engineCurrent,
    JSON.parse(await readFile(path.join(here, 'engine-expected.json'), 'utf8'))
  )
  process.stdout.write(
    `PASS: ${results.length} authoritative legacy branch-rule cases (${current.engine}).\n`
  )
} else if (mode === '--json') {
  process.stdout.write(
    JSON.stringify({
      ...current,
      source_sha256: Object.fromEntries(
        Object.entries(sources).map(([key, value]) => [
          files[key],
          createHash('sha256').update(value).digest('hex'),
        ])
      ),
    }) + '\n'
  )
} else if (mode === '--evaluate') {
  const chunks = []
  for await (const chunk of process.stdin) chunks.push(chunk)
  const input = JSON.parse(Buffer.concat(chunks).toString('utf8'))
  let output
  if (Array.isArray(input)) {
    output = []
    for (const item of input) output.push(await evaluate(item))
  } else output = await evaluate(input)
  process.stdout.write(JSON.stringify(output) + '\n')
} else
  throw new Error('Usage: node oracle.mjs --check|--record|--json|--evaluate')

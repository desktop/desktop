import assert from 'node:assert/strict'
import { execFile } from 'child_process'
import { mkdir, readFile, writeFile } from 'fs/promises'
import { join, resolve } from 'path'
import { describe, it } from 'node:test'
import { promisify } from 'util'
import { createTempDirectory } from '../app/test/helpers/temp'

const execFileAsync = promisify(execFile)
const workflowPath = resolve(__dirname, '../.github/workflows/ci.yml')

async function getWorkflowScript(stepName: string) {
  const workflow = (await readFile(workflowPath, 'utf8')).replace(/\r\n/g, '\n')
  const step = workflow
    .split(`      - name: ${stepName}\n`)[1]
    ?.split('\n      - ')[0]
  const script = step?.split('        run: |\n')[1]
  assert.ok(script, `Missing workflow script for ${stepName}`)
  return script.replace(/^ {10}/gm, '')
}

async function runPowerShell(script: string, environment: NodeJS.ProcessEnv) {
  return execFileAsync(
    'pwsh',
    ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script],
    {
      env: { ...process.env, NODE_TEST_CONTEXT: undefined, ...environment },
      timeout: 30_000,
    }
  )
}

const result = {
  exitCode: 0,
  startedAt: '2026-01-01T00:00:00Z',
  completedAt: '2026-01-01T00:00:01Z',
}

describe(
  'background Windows unit tests',
  { skip: process.platform !== 'win32' && !process.env.DESKTOP_TEST_PWSH },
  () => {
    for (const scenario of [
      'publish-during-exit',
      'missing',
      'failed',
    ] as const) {
      it(`collects the ${scenario} result`, async t => {
        const root = await createTempDirectory(t)
        const directory = join(root, 'desktop-unit-tests')
        await mkdir(directory)
        await writeFile(join(directory, 'pid'), '12345')
        await writeFile(join(directory, 'output.log'), 'Unit test output\n')
        await writeFile(join(directory, 'summary.md'), 'Unit test report\n')
        const resultPath = join(directory, 'result.json')
        const stagedPath = join(directory, 'staged-result.json')
        await writeFile(
          scenario === 'failed' ? resultPath : stagedPath,
          JSON.stringify({ ...result, exitCode: scenario === 'failed' ? 7 : 0 })
        )
        const summaryPath = join(root, 'collector-summary.md')
        const script = `
          $ErrorActionPreference = 'Stop'
          function Get-Process {
            if ($env:PUBLISH_DURING_EXIT -eq 'true') {
              Copy-Item (Join-Path $env:RUNNER_TEMP 'desktop-unit-tests/staged-result.json') (Join-Path $env:RUNNER_TEMP 'desktop-unit-tests/result.json')
            }
            return $null
          }
          ${await getWorkflowScript('Wait for Windows unit tests')}
        `
        const collection = runPowerShell(script, {
          RUNNER_TEMP: root,
          GITHUB_STEP_SUMMARY: summaryPath,
          PUBLISH_DURING_EXIT: String(scenario === 'publish-during-exit'),
        })
        if (scenario === 'missing') {
          await assert.rejects(collection, /exited without recording a result/)
        } else {
          if (scenario === 'failed') {
            await assert.rejects(
              collection,
              /Unit tests failed with exit code 7/
            )
          } else {
            await collection
          }
          const summary = await readFile(summaryPath, 'utf8')
          assert.match(summary, /Unit test report/)
          assert.match(
            summary,
            /Background test setup and unit tests: 1 seconds/
          )
        }
      })
    }

    it('hands off the reporter summary after the launch step file is removed', async t => {
      const root = await createTempDirectory(t)
      const directory = join(root, 'desktop-unit-tests')
      await mkdir(directory)
      const launchSummary = join(root, 'launch-summary.md')
      await writeFile(launchSummary, '')
      const fixture = join(root, 'fixture.cjs')
      await writeFile(
        fixture,
        "require('node:test').test('background summary regression', () => {})\n"
      )
      const launchScript = await getWorkflowScript(
        'Start Windows unit tests alongside the build'
      )
      const childScript = launchScript.match(
        /\$command = @'\n([\s\S]*?)\n'@/
      )?.[1]
      assert.ok(childScript)
      await runPowerShell(
        `
          function npm.cmd {
            if ($args[1] -eq 'test:setup') {
              Remove-Item $env:LAUNCH_SUMMARY
              $global:LASTEXITCODE = 0
            } else {
              & node --test --test-reporter node-test-github-reporter $env:TEST_FILE
              $global:LASTEXITCODE = $LASTEXITCODE
            }
          }
          ${childScript}
        `,
        {
          RUNNER_TEMP: root,
          GITHUB_STEP_SUMMARY: launchSummary,
          LAUNCH_SUMMARY: launchSummary,
          TEST_FILE: fixture,
          GITHUB_ACTIONS: 'true',
        }
      )
      const summaryPath = join(root, 'collector-summary.md')
      await writeFile(join(directory, 'pid'), '12345')
      await runPowerShell(
        `
          $ErrorActionPreference = 'Stop'
          function Get-Process { return $null }
          ${await getWorkflowScript('Wait for Windows unit tests')}
        `,
        { RUNNER_TEMP: root, GITHUB_STEP_SUMMARY: summaryPath }
      )
      const summary = await readFile(summaryPath, 'utf8')
      assert.match(summary, /Node.js Test Results/)
      assert.match(summary, /background summary regression/)
      assert.match(summary, /Background test setup and unit tests:/)
      assert.doesNotMatch(
        await readFile(join(directory, 'output.log'), 'utf8'),
        /Unable to access summary file/
      )
    })
  }
)

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  unlinkSync,
  rmdirSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import * as Path from 'node:path'
import { grantWindowsSandboxPermissions } from '../../../src/main-process/windows-sandbox-permissions'

function readPermissions(path: string): string {
  return execFileSync(
    Path.join(
      process.env.SystemRoot || 'C:\\Windows',
      'System32',
      'icacls.exe'
    ),
    [path],
    { encoding: 'utf8', windowsHide: true }
  )
}

describe(
  'Windows sandbox permissions',
  { skip: process.platform !== 'win32' },
  () => {
    it('grants inherited read/execute access, preserves existing grants, and is idempotent', () => {
      const parent = mkdtempSync(Path.join(tmpdir(), 'desktop-sandbox-'))
      const appFolder = Path.join(
        parent,
        'app with spaces & parentheses (test)'
      )
      const existingFile = Path.join(appFolder, 'icudtl.dat')
      const newFile = Path.join(appFolder, 'new.dat')
      mkdirSync(appFolder)
      writeFileSync(existingFile, 'test')

      try {
        const before = readPermissions(existingFile)
        const parentBefore = readPermissions(parent)
        grantWindowsSandboxPermissions(appFolder)
        const after = readPermissions(existingFile)

        // icacls localizes well-known account names, so query by numeric SID.
        const matches = execFileSync(
          Path.join(
            process.env.SystemRoot || 'C:\\Windows',
            'System32',
            'icacls.exe'
          ),
          [existingFile, '/findsid', '*S-1-15-2-2'],
          { encoding: 'utf8', windowsHide: true }
        )
        assert.ok(matches.includes(existingFile))
        assert.ok(after.includes('(I)(RX)'))
        for (const line of before
          .split('\n')
          .slice(1)
          .filter(l => l.startsWith(' '))) {
          assert.ok(after.includes(line.trim()))
        }
        assert.equal(readPermissions(parent), parentBefore)

        grantWindowsSandboxPermissions(appFolder)
        assert.equal(readPermissions(existingFile), after)
        writeFileSync(newFile, 'test')
        assert.ok(readPermissions(newFile).includes('(I)(RX)'))
      } finally {
        unlinkSync(existingFile)
        try {
          unlinkSync(newFile)
        } catch {}
        rmdirSync(appFolder)
        rmdirSync(parent)
      }
    })

    it('reports a failed grant instead of silently succeeding', () => {
      const parent = mkdtempSync(Path.join(tmpdir(), 'desktop-sandbox-'))
      try {
        assert.throws(() =>
          grantWindowsSandboxPermissions(Path.join(parent, 'missing'))
        )
      } finally {
        rmdirSync(parent)
      }
    })
  }
)

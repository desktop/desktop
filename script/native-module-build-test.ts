import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { resolve } from 'path'
import ts from 'typescript'
import notificationsPackage from '../vendor/desktop-notifications/package.json'
import trampolinePackage from '../vendor/desktop-trampoline/package.json'
import argvParserPackage from '../vendor/windows-argv-parser/package.json'

describe('native module TypeScript output', () => {
  for (const { name, main, additionalFiles } of [
    {
      ...notificationsPackage,
      additionalFiles: ['dist/notification-callback.d.ts'],
    },
    { ...trampolinePackage, additionalFiles: [] },
    { ...argvParserPackage, additionalFiles: [] },
  ]) {
    it(`emits the published entry points for ${name}`, async () => {
      const packageRoot = resolve(__dirname, '../vendor', name)
      const config = ts.getParsedCommandLineOfConfigFile(
        resolve(packageRoot, 'tsconfig.json'),
        {},
        {
          ...ts.sys,
          onUnRecoverableConfigFileDiagnostic: diagnostic =>
            assert.fail(
              ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')
            ),
        }
      )
      assert.ok(config)

      const program = ts.createProgram(config.fileNames, config.options)
      const emittedFiles = new Set<string>()
      const result = program.emit(undefined, fileName => {
        emittedFiles.add(resolve(fileName))
      })
      const diagnostics = [
        ...config.errors,
        ...ts.getPreEmitDiagnostics(program),
        ...result.diagnostics,
      ]
      assert.equal(
        diagnostics.length,
        0,
        diagnostics
          .map(diagnostic =>
            ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')
          )
          .join('\n')
      )
      assert.equal(result.emitSkipped, false)

      const expectedFiles = [
        main,
        ...(config.options.declaration ? [main.replace(/\.js$/, '.d.ts')] : []),
        ...additionalFiles,
      ]
      for (const file of expectedFiles) {
        assert.ok(
          emittedFiles.has(resolve(packageRoot, file)),
          `Expected ${name} to emit ${file}; emitted:\n${Array.from(
            emittedFiles
          ).join('\n')}`
        )
      }
    })
  }
})

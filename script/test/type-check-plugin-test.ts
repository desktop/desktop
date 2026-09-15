import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { it } from 'node:test'
import webpack from 'webpack'
import { nativeTypeCheckPlugin } from '../type-check-plugin'

it('withholds webpack output when an unbundled file has a type error', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'desktop-webpack-check-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const config = join(directory, 'tsconfig.json')
  const invalidFile = join(directory, 'unbundled.ts')
  const output = join(directory, 'out', 'main.js')
  await writeFile(
    config,
    JSON.stringify({
      compilerOptions: { strict: true, types: [], module: 'nodenext' },
      include: ['*.ts'],
    })
  )
  await writeFile(join(directory, 'entry.js'), 'console.log("valid entry")')
  await writeFile(invalidFile, 'const value: number = "not a number"')

  const compiler = webpack({
    mode: 'development',
    entry: join(directory, 'entry.js'),
    output: { path: join(directory, 'out'), filename: 'main.js' },
    optimization: { emitOnErrors: false },
    plugins: [nativeTypeCheckPlugin(config)],
  })
  t.after(
    () =>
      new Promise<void>((resolve, reject) =>
        compiler.close(error => (error ? reject(error) : resolve()))
      )
  )

  const stats = await new Promise<webpack.Stats>((resolve, reject) => {
    compiler.run((error, stats) => {
      if (error !== null) {
        reject(error)
      } else if (stats === undefined) {
        reject(new Error('Webpack did not return compilation stats'))
      } else {
        resolve(stats)
      }
    })
  })

  assert.equal(stats.hasErrors(), true)
  assert.equal(stats.compilation.fileDependencies.has(invalidFile), true)
  await assert.rejects(readFile(output), { code: 'ENOENT' })
})

it(
  'rechecks unbundled files and recovers in watch mode',
  { timeout: 60_000 },
  async t => {
    const directory = await mkdtemp(join(tmpdir(), 'desktop-webpack-watch-'))
    t.after(() => rm(directory, { recursive: true, force: true }))
    const config = join(directory, 'tsconfig.json')
    const checkedFile = join(directory, 'unbundled.ts')
    await writeFile(
      config,
      JSON.stringify({
        compilerOptions: { strict: true, types: [], module: 'nodenext' },
        include: ['*.ts'],
      })
    )
    await writeFile(join(directory, 'entry.js'), 'console.log("entry")')
    await writeFile(checkedFile, 'const value: number = 1')
    const compiler = webpack({
      mode: 'development',
      entry: join(directory, 'entry.js'),
      output: { path: join(directory, 'out'), filename: 'main.js' },
      optimization: { emitOnErrors: false },
      plugins: [nativeTypeCheckPlugin(config)],
    })
    const output = join(directory, 'out', 'main.js')
    let stage = 0
    await new Promise<void>((resolve, reject) => {
      const watcher = compiler.watch({}, (error, stats) => {
        if (error !== null || stats === undefined) {
          reject(error ?? new Error('Webpack did not return watch stats'))
          return
        }
        const verify = async () => {
          if (stage === 0) {
            assert.equal(stats.hasErrors(), false)
            await readFile(output)
            stage = 1
            await writeFile(checkedFile, 'const value: number = "invalid"')
          } else if (stage === 1) {
            assert.equal(stats.hasErrors(), true)
            assert.equal(stats.compilation.emittedAssets.size, 0)
            stage = 2
            await writeFile(checkedFile, 'const value: number = 2')
          } else {
            assert.equal(stats.hasErrors(), false)
            resolve()
          }
        }
        void verify().catch(reject)
      })
      assert.ok(watcher, 'Webpack did not start watching')
      t.after(
        () =>
          new Promise<void>((resolve, reject) =>
            watcher.close(error => (error ? reject(error) : resolve()))
          )
      )
    })
  }
)

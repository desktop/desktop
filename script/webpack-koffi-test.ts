import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { mkdir, readFile, writeFile } from 'fs/promises'
import { join, resolve } from 'path'
import webpack from 'webpack'
import merge from 'webpack-merge'
import { createTempDirectory } from '../app/test/helpers/temp'
import { getKoffiWebpackConfig } from './webpack-koffi'

const targets = (['darwin', 'win32', 'linux'] as const).flatMap(platform =>
  ['arm64', 'x64'].map(arch => ({
    platform,
    arch,
    name: `${platform}-${arch}`,
  }))
)

describe('Koffi webpack output', () => {
  for (const { platform, arch, name: target } of targets) {
    it(`bundles only ${target} when other native packages are installed`, async t => {
      const root = await createTempDirectory(t)
      const nodeModules = join(root, 'node_modules')
      for (const { name: installedTarget } of targets) {
        const directory = join(
          nodeModules,
          '@koromix',
          `koffi-${installedTarget}`
        )
        await mkdir(directory, { recursive: true })
        await writeFile(
          join(directory, 'package.json'),
          JSON.stringify({
            name: `@koromix/koffi-${installedTarget}`,
            main: 'index.js',
            type: 'commonjs',
          })
        )
        await writeFile(
          join(directory, 'index.js'),
          "module.exports = require('./koffi.node')"
        )
        await writeFile(join(directory, 'koffi.node'), installedTarget)
      }

      const entry = join(root, 'index.js')
      await writeFile(entry, "import koffi from 'koffi'; export default koffi")
      const config: webpack.Configuration = {
        mode: 'production',
        optimization: { minimize: false },
        target: 'electron-renderer',
        entry,
        output: {
          path: join(root, 'out'),
          filename: 'bundle.js',
          library: { type: 'commonjs2' },
        },
        resolve: {
          modules: [nodeModules, resolve(__dirname, '../app/node_modules')],
        },
        module: {
          rules: [
            {
              test: /\.node$/,
              loader: require.resolve('awesome-node-loader'),
              options: { name: '[name].[ext]' },
            },
          ],
        },
      }
      const compiler = webpack(
        merge(config, getKoffiWebpackConfig(nodeModules, platform, arch))
      )
      assert.ok(compiler)
      t.after(
        () =>
          new Promise<void>((resolve, reject) =>
            compiler.close(error => (error ? reject(error) : resolve()))
          )
      )
      const stats = await new Promise<webpack.Stats>((resolve, reject) => {
        compiler.run((error, stats) => {
          if (error) {
            reject(error)
          } else if (stats === undefined) {
            reject(new Error('Webpack returned no compilation statistics'))
          } else {
            resolve(stats)
          }
        })
      })
      assert.equal(stats.hasErrors(), false, stats.toString('errors-only'))
      assert.deepEqual(
        stats.compilation
          .getAssets()
          .map(asset => asset.name)
          .sort(),
        ['bundle.js', 'koffi.node'],
        stats.toString({ all: false, warnings: true, modules: true })
      )
      assert.equal(await readFile(join(root, 'out/koffi.node'), 'utf8'), target)
    })
  }

  it('fails before compiling when the target native package is missing', async t => {
    const root = await createTempDirectory(t)
    assert.throws(
      () => getKoffiWebpackConfig(join(root, 'node_modules'), 'darwin', 'x64'),
      /Cannot find module '@koromix\/koffi-darwin-x64'/
    )
  })
})

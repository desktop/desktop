import { resolve } from 'node:path'
import type { Compiler } from 'webpack'

/**
 * Keep webpack's emit-on-errors protection effective with an isolated transpiler.
 */
export function nativeTypeCheckPlugin(config: string) {
  return {
    apply(compiler: Compiler) {
      compiler.hooks.afterCompile.tapPromise(
        'NativeTypeCheck',
        async compilation => {
          const { checkProject, listProjectFiles, projectRoot } = await import(
            './type-check.mjs'
          )
          compilation.fileDependencies.add(resolve(projectRoot, config))
          compilation.fileDependencies.add(
            resolve(projectRoot, 'script/tsconfig.json')
          )
          compilation.contextDependencies.add(resolve(projectRoot, 'app/src'))
          compilation.contextDependencies.add(resolve(projectRoot, 'app/test'))
          compilation.contextDependencies.add(resolve(projectRoot, 'script'))

          try {
            for (const project of [config, 'script/tsconfig.json']) {
              for (const file of await listProjectFiles(project)) {
                compilation.fileDependencies.add(file)
              }
              await checkProject(project)
            }
          } catch (error) {
            compilation.errors.push(
              new compiler.webpack.WebpackError(
                error instanceof Error ? error.message : String(error)
              )
            )
          }
        }
      )
    },
  }
}

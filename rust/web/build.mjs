import { build } from 'esbuild'
import { readFile } from 'node:fs/promises'

const notices = await readFile(
  new URL('./THIRD_PARTY_NOTICES.txt', import.meta.url),
  'utf8'
)
await build({
  entryPoints: ['src/panels.ts'],
  bundle: true,
  outfile: 'panels.js',
  format: 'esm',
  platform: 'browser',
  target: ['es2020'],
  minify: true,
  legalComments: 'eof',
  banner: { js: `/*!\n${notices.replaceAll('*/', '* /')}\n*/` },
  define: { 'process.env.NODE_ENV': '"production"' },
})

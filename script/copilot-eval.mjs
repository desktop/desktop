import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

if (process.argv[2] === '--describe') {
  console.log(
    JSON.stringify({
      protocolVersion: 1,
      features: ['assisted-commit'],
      inputKinds: ['analysis', 'repository'],
    })
  )
} else {
  const child = spawn(
    process.execPath,
    [
      '--conditions=import',
      '--import',
      'tsx',
      '--import',
      './script/copilot-eval/bootstrap.mjs',
      './script/copilot-eval/main.mjs',
      ...process.argv.slice(2),
    ],
    {
      cwd: fileURLToPath(new URL('../', import.meta.url)),
      stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
      env: Object.fromEntries(
        Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_'))
      ),
    }
  )
  let ready = false
  let cancellationRequested = false
  const cancel = () => {
    cancellationRequested = true
    if (ready && child.connected) {
      child.send('cancel')
    }
  }
  child.on('message', message => {
    if (message === 'ready') {
      ready = true
      if (cancellationRequested) {
        cancel()
      }
    }
  })
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, cancel)
  }
  child.on('error', error => {
    console.error(error.message)
    process.exitCode = 1
  })
  child.on('exit', (code, signal) => {
    process.exitCode = code ?? (signal === 'SIGINT' ? 130 : 1)
  })
}

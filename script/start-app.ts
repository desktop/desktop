import { run } from './run'

export function startApp() {
  const runningApp = run({ stdio: 'inherit' })
  if (runningApp == null) {
    console.error(
      "Couldn't launch the app. You probably need to build it first. Run `yarn build:dev`."
    )
    process.exit(1)
    return
  }

  return runningApp
}

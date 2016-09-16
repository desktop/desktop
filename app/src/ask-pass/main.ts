/**
 * This will be run by the `ask-pass-trampoline` on macOS.
 */

import { responseForPrompt } from './ask-pass'

const prompt = process.argv[2]
const response = responseForPrompt(prompt)
if (response) {
  process.stdout.write(response)
  process.stdout.end()
}

import protocol from './parse-request.ts'
import evaluation from '../../app/src/lib/copilot-evaluation.ts'

const { parseCopilotEvaluationRequest, EvaluationRequestError } = protocol
const { listCopilotEvaluationModels, runCopilotEvaluation } = evaluation
const controller = new AbortController()
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => controller.abort())
}

try {
  if (process.argv[2] === '--list-models') {
    console.log(JSON.stringify(await listCopilotEvaluationModels()))
  } else {
    if (process.argv.length > 2) {
      throw new EvaluationRequestError('Unknown evaluation bridge argument')
    }
    let length = 0
    const chunks = []
    for await (const chunk of process.stdin) {
      length += chunk.length
      if (length > 32 * 1024 * 1024) {
        throw new EvaluationRequestError('Evaluation request exceeds 32 MiB')
      }
      chunks.push(chunk)
    }
    const request = parseCopilotEvaluationRequest(
      JSON.parse(Buffer.concat(chunks).toString('utf8'))
    )
    const result = await runCopilotEvaluation(request, controller.signal)
    console.log(JSON.stringify(result))
    process.exitCode = result.status === 'ok' ? 0 : 1
  }
} catch (error) {
  const token =
    process.env.COPILOT_GITHUB_TOKEN ??
    process.env.GH_TOKEN ??
    process.env.GITHUB_TOKEN
  const message = error instanceof Error ? error.message : String(error)
  console.log(
    JSON.stringify({
      protocolVersion: 1,
      feature: 'assisted-commit',
      status: 'error',
      transport: 'unknown',
      turns: [],
      durationMs: 0,
      error: {
        name: error instanceof Error ? error.name : 'Error',
        code:
          error instanceof EvaluationRequestError ||
          error instanceof SyntaxError
            ? 'invalid-request'
            : 'bridge-error',
        message: token ? message.split(token).join('[REDACTED]') : message,
      },
    })
  )
  process.exitCode = 1
}

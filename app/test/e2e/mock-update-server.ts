/* eslint-disable no-sync */

import http from 'http'
import type net from 'net'
import {
  getWindowsFullNugetPackageName,
  getWindowsIdentifierName,
} from '../../../script/dist-info'

/** Fixed port used for the mock update server during e2e tests. */
export const MOCK_UPDATE_PORT = 51789
export const MOCK_UPDATE_URL = `http://127.0.0.1:${MOCK_UPDATE_PORT}/update`

/**
 * URL that e2e tests can use to control the mock server behaviour at runtime
 * via simple GET requests (e.g. `/_control/set-behavior/update-available`).
 */
export const MOCK_CONTROL_URL = `http://127.0.0.1:${MOCK_UPDATE_PORT}/_control`

const currentWindowsPackageName = getWindowsFullNugetPackageName()
const nextWindowsPackageName = `${getWindowsIdentifierName()}-99.0.0-full.nupkg`
const fakeSha = '0123456789012345678901234567890123456789'
const fakePackageSize = '999999999'

function isWindowsFeedRequest(url: string) {
  return url.includes('/RELEASES') || url.endsWith('.nupkg')
}

function getWindowsNoUpdateReleases() {
  return `${fakeSha} ${currentWindowsPackageName} ${fakePackageSize}`
}

function getWindowsUpdateAvailableReleases() {
  return `${fakeSha} ${nextWindowsPackageName} ${fakePackageSize}`
}

export type UpdateBehavior = 'no-update' | 'update-available'

export interface IMockUpdateServer {
  readonly server: http.Server
  readonly url: string

  /** All requests received by the mock server (excluding control requests). */
  readonly requests: Array<{ method: string; url: string }>

  /** Change how the server responds to update checks. */
  setBehavior(behavior: UpdateBehavior): void

  /** Reset the captured request log. */
  resetRequests(): void

  close(): Promise<void>
}

/**
 * Create a mock update server that mimics the responses from
 * central.github.com for Squirrel (macOS) and Squirrel.Windows.
 *
 * By default, it responds with "no update available" (HTTP 204).
 *
 * In `update-available` mode, the JSON (macOS) or RELEASES (Windows)
 * feed tells Squirrel that an update exists. When Squirrel then requests
 * the update payload (zip or `.nupkg`), the mock server responds with
 * HTTP 200 and intentionally keeps the download response open without
 * completing. This is enough to verify that the app correctly processes
 * the update feed and transitions into (and remains in) the expected
 * "update available" / "downloading" states during tests.
 *
 * Full binary verification is not possible in dev builds because
 * Squirrel.Mac requires the update zip to satisfy the running app's code
 * signing designated requirements — something only production-signed
 * builds can provide.
 */
export function createMockUpdateServer(): Promise<IMockUpdateServer> {
  return new Promise((resolve, reject) => {
    let behavior: UpdateBehavior = 'no-update'
    const requests: Array<{ method: string; url: string }> = []
    const sockets = new Set<net.Socket>()

    const server = http.createServer((req, res) => {
      const url = req.url ?? '/'

      // ── Control plane ─────────────────────────────────────────────
      if (url.startsWith('/_control/')) {
        const action = url.replace('/_control/', '')

        if (action === 'set-behavior/no-update') {
          behavior = 'no-update'
          res.writeHead(200)
          res.end('ok')
          return
        }

        if (action === 'set-behavior/update-available') {
          behavior = 'update-available'
          res.writeHead(200)
          res.end('ok')
          return
        }

        if (action === 'reset-requests') {
          requests.length = 0
          res.writeHead(200)
          res.end('ok')
          return
        }

        if (action === 'requests') {
          res.writeHead(200, { 'content-type': 'application/json' })
          res.end(JSON.stringify(requests))
          return
        }

        if (action === 'behavior') {
          res.writeHead(200)
          res.end(behavior)
          return
        }

        res.writeHead(404)
        res.end('unknown control action')
        return
      }

      // ── Update plane ──────────────────────────────────────────────
      requests.push({ method: req.method ?? 'GET', url })

      // Serve fake download URLs by hanging forever — send headers but never
      // finish the body. This keeps the updater in "downloading" state
      // without ever completing or failing validation.
      if (url.startsWith('/download/') || url.endsWith('.nupkg')) {
        res.writeHead(200, {
          'content-type': 'application/octet-stream',
          'content-length': '999999999',
        })
        // Intentionally never call res.end() — the connection stays
        // open until the server is shut down or the client disconnects.
        return
      }

      if (req.method === 'HEAD') {
        // Priority update status check.
        res.writeHead(200, { 'x-prioritize-update': 'false' })
        res.end()
        return
      }

      if (isWindowsFeedRequest(url)) {
        const body =
          behavior === 'update-available'
            ? getWindowsUpdateAvailableReleases()
            : getWindowsNoUpdateReleases()

        if (url.includes('/RELEASES')) {
          res.writeHead(200, {
            'content-type': 'text/plain; charset=utf-8',
            'content-length': Buffer.byteLength(body),
          })
          res.end(body)
          return
        }
      }

      if (behavior === 'no-update') {
        res.writeHead(204)
        res.end()
        return
      }

      if (behavior === 'update-available') {
        // Squirrel.Mac JSON feed. The download URL points back to this server's
        // /download/ handler which hangs forever, keeping the app in
        // "downloading" state without completing or erroring.
        const body = JSON.stringify({
          url: `http://127.0.0.1:${MOCK_UPDATE_PORT}/download/update.zip`,
          name: '99.0.0',
          notes: 'E2E test update',
          pub_date: new Date().toISOString(),
        })
        res.writeHead(200, {
          'content-type': 'application/json',
          'content-length': Buffer.byteLength(body),
        })
        res.end(body)
        return
      }

      res.writeHead(204)
      res.end()
    })

    server.on('error', reject)
    server.on('connection', socket => {
      sockets.add(socket)
      socket.on('close', () => sockets.delete(socket))
    })
    server.listen(MOCK_UPDATE_PORT, '127.0.0.1', () => {
      const instance: IMockUpdateServer = {
        server,
        url: MOCK_UPDATE_URL,
        requests,
        setBehavior(b: UpdateBehavior) {
          behavior = b
        },
        resetRequests() {
          requests.length = 0
        },
        close() {
          return new Promise<void>((res, rej) => {
            for (const socket of sockets) {
              socket.destroy()
            }

            server.close(err => (err ? rej(err) : res()))
          })
        },
      }
      resolve(instance)
    })
  })
}

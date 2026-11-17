/**
 * dsh-chat-deepseek — host half.
 *
 * Owns the local reverse proxy that makes chat.deepseek.com embeddable (see
 * ./proxy.ts for the three rewrites and why each is required), and publishes
 * one small status route the browser half reads to learn the proxy URL.
 *
 * The browser half cannot guess the port (the preferred one may be taken), so
 * the URL is always fetched from `/api/dsh-chat-deepseek/status` rather than
 * hard-coded on the client side.
 */

import type { Context, Volatile } from '@deepseek-ai/cordis'
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver'
import z from '@deepseek-ai/schemastery'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { DEFAULT_PORT, startProxy, type ProxyHandle } from './proxy.ts'

/** Stable cordis plugin name. */
export const name = 'chat-deepseek'

/** Services required before the proxy can mount. */
export const inject = ['webServer']

/** Status route the browser half polls for the proxy URL. */
export const STATUS_PATH = '/api/dsh-chat-deepseek/status'

/**
 * Detect a cordis volatile config cell.
 *
 * Inlined rather than imported from @deepseek-ai/cosmokit: a desktop profile
 * installs only the packages its bundles declare, and pulling in an extra
 * Host-provided package just to read one value is a needless load-time
 * dependency. The shape check is what `isVolatile` itself does.
 *
 * @param value - a config field that may be a live volatile cell.
 * @returns true when the value exposes a `get` function.
 */
function isVolatile(value: unknown): value is { get(): unknown } {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { get?: unknown }).get === 'function'
  )
}

/** Plugin config, validated by the same-named schemastery schema. */
export interface Config {
  /** Master switch (live-editable). */
  enabled?: Volatile<boolean>
  /** Preferred loopback port for the proxy (live-editable). */
  port?: Volatile<number>
}

// All fields volatile: the settings form can edit them without remounting.
//
// `port` is bounded because the value goes straight into `server.listen()`: a
// negative or out-of-range number throws there, and the failure would surface
// only as "proxy not started" in the panel. 0 is legal and means "let the OS
// pick", which is also the fallback path.
export const Config = z.object({
  enabled: z.boolean().required(false).volatile(),
  port: z.number().min(0).max(65535).required(false).volatile(),
})

/** Unwrap volatile config fields into plain data. */
function unwrapConfig(config?: Partial<Config>): { enabled?: boolean; port?: number } {
  if (config === undefined) return {}
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(config)) {
    const resolved = isVolatile(value) ? value.get() : value
    if (resolved === undefined) continue
    result[key] = resolved
  }
  return result as { enabled?: boolean; port?: number }
}

/**
 * Mount the proxy and the status route.
 *
 * @param ctx - host plugin context carrying webServer.
 * @param config - resolved plugin config (volatile fields read via .get()).
 */
export function apply(ctx: Context, config?: Partial<Config>): void {
  const resolved = unwrapConfig(config)
  const enabled = resolved.enabled !== false
  const preferredPort = resolved.port ?? DEFAULT_PORT

  if (!enabled) {
    console.log('[dsh-chat-deepseek] disabled by config')
    return
  }

  /** The running proxy, or undefined while it is still starting / after failure. */
  let proxy: ProxyHandle | undefined
  /** Why the proxy is unavailable, surfaced to the panel so the UI can explain itself. */
  let failure: string | undefined

  // Persist the last-viewed conversation beside the plugin's own state so a
  // restart can reopen the same chat. Kept in the DSH home, not the workspace:
  // it is per-machine UI state, not project data.
  const stateFile = join(homedir(), '.dsh', 'dsh-chat-deepseek', 'last-conversation.json')

  const ready = startProxy(preferredPort, stateFile)
    .then((handle) => {
      proxy = handle
      console.log(`[dsh-chat-deepseek] proxy listening on ${handle.url}`)
      return handle
    })
    .catch((error: unknown) => {
      failure = error instanceof Error ? error.message : String(error)
      console.warn('[dsh-chat-deepseek] proxy failed to start:', failure)
      return undefined
    })

  // Status route: the browser half asks for the proxy URL before mounting.
  // Answers 200 with `{ url, lastConversation }` once ready, or 503 with the
  // reason, so a failed start shows a real message instead of a blank frame.
  //
  // `lastConversation` lets the panel reopen the chat the user had on screen
  // before the app was closed. It is the id the proxy observed on the wire —
  // the parent frame cannot read a cross-origin iframe's URL.
  const statusRoute: WebRoute = {
    kind: 'exact',
    path: STATUS_PATH,
    handler: (req, res) => {
      void ready.then((handle) => {
        const payload =
          handle === undefined
            ? { ready: false, error: failure ?? 'proxy not started' }
            : {
                ready: true,
                url: handle.url,
                port: handle.port,
                lastConversation: handle.lastConversation() ?? null,
              }
        res.writeHead(handle === undefined ? 503 : 200, {
          'content-type': 'application/json; charset=utf-8',
          // The proxy port can change between launches; never let it be cached.
          'cache-control': 'no-store',
        })
        res.end(JSON.stringify(payload))
      })
    },
  }

  ctx.effect(
    () => {
      const disposeRoute = ctx.webServer.register(statusRoute)
      return () => {
        disposeRoute()
        void proxy?.dispose()
        proxy = undefined
      }
    },
    'dsh-chat-deepseek: proxy + status route',
  )
}

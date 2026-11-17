/**
 * Panel runtime: the overlay's lifecycle, driven by the shell's panel selection.
 *
 * WHAT CHANGED FROM THE DOM-INJECTION ERA
 * ---------------------------------------
 * Selection used to be a private boolean plus a pile of coordination: an injected
 * `<button>`, a `data-*-active` attribute on `<html>`, a click guard that closed
 * sibling overlays, a layout-store bridge that deselected built-in panels, and a
 * retry loop for when that service arrived late. The shell now owns all of it:
 * a row in `sidebar.panellist` selects a key in the `main` slot, and
 * `layout.panelInfo.activePanelId` is the single source of truth. What is left
 * here is only what the shell cannot do — keeping ONE warm iframe alive behind
 * that selection.
 *
 * WHY THE IFRAME IS NOT INSIDE THE SLOT COMPONENT
 * ----------------------------------------------
 * Chrome reloads an iframe on any DOM move, and React unmounts the slot occupant
 * whenever the user switches panel or session. A frame inside it would therefore
 * reload — and lose an answer mid-stream — on every switch. So the frame stays on
 * `<body>` and this runtime only shows/hides it with `visibility`, copying its
 * rectangle from the slot's box (positioning.ts).
 *
 * VISIBILITY, NEVER `display: none`
 * ---------------------------------
 * The frame is created before the panel is ever selected. Under `display: none`
 * it boots with a zero-width viewport, the SPA's `min-width: 1024px` query fails,
 * and it forces its own sidebar collapsed — then persists that. `visibility:
 * hidden` still lays out, so the frame gets a real viewport. See styles.ts.
 */

import type { ClientLayout } from '@deepseek-ai/dsh-client-runtime/client'
import { diagnoseMountFailure, showDiagnosis } from './diagnose.ts'
import { createPanel, type PanelView } from './panel-view.ts'
import { positionOverSlot, watchSlotBox, type SlotWatcher } from './positioning.ts'
import { getActivePanel, setActivePanel } from './persist.ts'
import { STYLES, STYLE_ID } from './styles.ts'

/**
 * This panel's identity, used in BOTH slots.
 *
 * `sidebar.panellist`'s `id` and `main`'s `key` must be the same string: the row
 * selects its own id as the main-panel key, and the layout service refuses ids
 * that are not registered there.
 */
export const PANEL_ID = 'chat-deepseek'

/** Cross-plugin activation event; detail is the activating panel name. */
const ACTIVATE_EVENT = 'dsh-panel-activate'
/**
 * Sibling plugins' activation attributes (wiki / ssh / task board).
 *
 * Those panels are DOM overlays that are not in the layout store, so selecting
 * this panel does not tell them anything. They listen for the activate event
 * above; clearing their attribute as well is belt and braces and costs nothing.
 */
const OTHER_ACTIVE_ATTRS = ['data-dsh-wiki-active', 'data-dsh-ssh-active', 'data-dsh-taskboard-active']

/** Host route publishing the proxy URL (must match the host half). */
const STATUS_PATH = '/api/dsh-chat-deepseek/status'

/**
 * Route prefix for one conversation in the SPA.
 *
 * The SPA navigates with history.pushState, so its URL is not readable from this
 * (cross-origin) parent frame. The restore path is therefore constructed from the
 * conversation id the PROXY observed on the wire, not scraped from the frame.
 */
const CHAT_ROUTE_PREFIX = '/a/chat/s/'

/** Shape of the status route's JSON answer. */
interface ProxyStatus {
  ready: boolean
  url?: string
  port?: number
  error?: string
  /** Last conversation the proxy observed, or null when none has been seen. */
  lastConversation?: string | null
}

/** What the plugin's `apply` needs back from the runtime. */
export interface ChatRuntime {
  /**
   * Re-select this panel when it was the last one open.
   *
   * Called by the registration code the moment the `main` slot entry exists:
   * `layout.selectPanel` throws for an unregistered key, so the order matters.
   * Safe to call more than once — only the first call does anything.
   */
  restoreSelection(): void
  /** Tear everything down (plugin unload / hot reload). */
  dispose(): void
}

/** Inject the stylesheet once (idempotent). */
function ensureStyles(): void {
  if (document.getElementById(STYLE_ID) !== null) return
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = STYLES
  document.head.appendChild(style)
}

/** Ask the host where the proxy is listening. */
async function fetchStatus(): Promise<ProxyStatus> {
  const res = await fetch(STATUS_PATH, { headers: { accept: 'application/json' } })
  return (await res.json()) as ProxyStatus
}

/**
 * Start the panel runtime.
 *
 * Creates the overlay immediately (hidden) so the frame is warm and boots at a
 * realistic size before the user ever opens the panel, then follows the layout
 * store for open/close.
 *
 * @param layout - the GUI's layout service; its `panelInfo` is authoritative.
 * @returns handles the registration code and the disposer need.
 */
export function mountRuntime(layout: ClientLayout): ChatRuntime {
  ensureStyles()

  let view: PanelView | undefined
  let watcher: SlotWatcher | undefined
  /** The proxy URL, resolved once per overlay. */
  let proxyUrl: string | undefined
  /** True once a status read has completed (success or failure). */
  let statusRead = false
  /** True once the restore attempt has run; also gates persistence. */
  let restoreAttempted = false
  /** Last applied open state, so a redundant store notification touches nothing. */
  let open = false

  const openExternal = (): void => {
    window.open('https://chat.deepseek.com/', '_blank', 'noopener,noreferrer')
  }

  /** Explicit user reload: the only path allowed to rebuild the frame. */
  const refresh = (): void => {
    if (view === undefined || proxyUrl === undefined) return
    view.showFrame(proxyUrl)
  }

  /** Read the proxy URL and attach the frame (or explain why it failed). */
  const resolveProxy = async (): Promise<void> => {
    if (statusRead) return
    statusRead = true
    try {
      const status = await fetchStatus()
      if (!status.ready || status.url === undefined) {
        view?.showState(`DeepSeek 代理未就绪：${status.error ?? '未知原因'}`, true)
        return
      }
      proxyUrl = status.url
      // Never rebuild an existing frame: that is what would lose the user's
      // current chat. The frame outlives every open/close cycle.
      if (view === undefined || view.hasFrame()) return

      // Give the container its real rectangle first: a frame created in a
      // zero-sized box boots with a zero-sized viewport, and the SPA then forces
      // its own sidebar closed for good.
      positionOverSlot(view.container)

      // Restore the conversation the user had open before the app closed. The id
      // comes from the proxy (the only place it is observable), and is only used
      // on the FIRST frame creation — afterwards the frame keeps its own
      // navigation state and must not be re-pointed.
      const last = status.lastConversation
      const initial =
        typeof last === 'string' && last !== ''
          ? new URL(CHAT_ROUTE_PREFIX + last, status.url).toString()
          : status.url
      view.showFrame(initial)
    } catch (error) {
      view?.showState(
        `无法读取代理状态（${error instanceof Error ? error.message : String(error)}）。` +
          '请确认插件已在 Host 侧启用后重试。',
        true,
      )
    }
  }

  /**
   * Create the overlay once and attach it to `<body>`.
   *
   * Deliberately not remount-by-default: an existing overlay is reused so the
   * iframe inside it is never re-parented. A rebuilt overlay means the previous
   * frame went with it, so the proxy is read again.
   */
  const ensure = (): PanelView => {
    if (view !== undefined && view.container.isConnected) return view
    if (view !== undefined) {
      statusRead = false
      proxyUrl = undefined
      watcher?.dispose()
      watcher = undefined
    }
    view = createPanel(refresh, openExternal)
    // Appended to <body>: outside the React tree that owns the centre column, so a
    // session or panel switch can never destroy it.
    document.body.appendChild(view.container)
    view.showState('正在连接 DeepSeek…', false)
    watcher = watchSlotBox(view.container)
    void resolveProxy()
    return view
  }

  /** Clear other overlays so only one panel paints in the centre column. */
  const evictSiblings = (): void => {
    for (const attr of OTHER_ACTIVE_ATTRS) document.documentElement.removeAttribute(attr)
    document.dispatchEvent(new CustomEvent(ACTIVATE_EVENT, { detail: PANEL_ID }))
  }

  /** Show or hide the overlay to match the shell's selection. */
  const applySelection = (): void => {
    let activePanelId: string | null = null
    try {
      activePanelId = layout.panelInfo.getSnapshot().activePanelId
    } catch {
      // A transient store error must not break the panel; the next notification
      // will bring the truth.
      return
    }
    const next = activePanelId === PANEL_ID
    // Persistence is gated on the restore attempt: the FIRST notification arrives
    // with `null` (nothing is selected yet) and writing that would erase the value
    // the restore path is about to read.
    if (restoreAttempted) setActivePanel(next ? 'chat' : '')
    if (next === open) {
      if (next) positionOverSlot(ensure().container)
      return
    }
    open = next

    const panel = ensure()
    if (!next) {
      delete panel.container.dataset.open
      return
    }
    try {
      evictSiblings()
      positionOverSlot(panel.container)
      panel.container.dataset.open = ''
      void resolveProxy()
    } catch (error) {
      // Surface it in-page: the packaged GUI has no devtools, and a selected row
      // with nothing behind it is worse than an error message.
      console.error('[dsh-chat-deepseek] failed to open the panel:', error)
      try {
        showDiagnosis(diagnoseMountFailure(error))
      } catch {
        // Rendering the diagnosis must never be the thing that breaks.
      }
    }
  }

  const unsubscribe = layout.panelInfo.subscribe(applySelection)
  ensure()
  applySelection()

  return {
    restoreSelection(): void {
      if (restoreAttempted) return
      restoreAttempted = true
      if (getActivePanel() !== 'chat') return
      try {
        layout.selectPanel(PANEL_ID)
      } catch (error) {
        // The slot entry is registered by the caller immediately before this, so a
        // rejection means the shell refused the key: report rather than retry in a
        // loop that can never succeed.
        console.warn('[dsh-chat-deepseek] could not restore the panel selection:', error)
      }
    },
    dispose(): void {
      unsubscribe()
      watcher?.dispose()
      watcher = undefined
      view?.container.remove()
      view = undefined
    },
  }
}

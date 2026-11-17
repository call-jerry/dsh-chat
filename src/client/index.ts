/**
 * dsh-chat-deepseek — browser half. Runs inside the dsh web GUI.
 *
 * Registers the plugin as a REAL GUI panel instead of injecting DOM:
 *
 *   `sidebar.panellist`  one row in the shell's own panel list. The shell renders
 *                        the label, the active highlight and the click handler
 *                        (`layout.selectPanel(id)`), so the row and the selection
 *                        can never disagree.
 *   `main`               the centre-column occupant for the same id. The layout
 *                        service validates this registration before it will select
 *                        the panel, and mutual exclusion with the built-in panels
 *                        (Plugins / Scheduled tasks) and the Conversation becomes
 *                        the shell's own state machine.
 *
 * What the shell cannot do is keep ONE warm iframe alive: React unmounts the slot
 * occupant on every switch, and Chrome reloads an iframe on any DOM move. So the
 * occupant is an empty measuring box (main-panel.ts) and the actual chat surface is
 * a fixed overlay on `<body>` (mount.ts), shown while the shell says this panel is
 * selected.
 *
 * The frame points at this plugin's own loopback proxy (host half), which is how an
 * otherwise un-embeddable site renders inside the GUI.
 *
 * FAILURE POLICY
 * --------------
 * Each step is isolated and a failure is surfaced in-page by diagnose.ts: the
 * packaged GUI has no devtools, so a console-only reason is invisible.
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import { clearDiagnosis, diagnoseMountFailure, showDiagnosis } from './diagnose.ts'
import { DeepSeekIcon } from './icon.ts'
import { DeepSeekPanel } from './main-panel.ts'
import { mountRuntime, PANEL_ID, type ChatRuntime } from './mount.ts'

/**
 * Services this plugin cannot work without.
 *
 * Both are core: without `slots` there is no way to register, and without `layout`
 * there is no panel selection to follow. Declaring them is also what makes
 * `ctx.slots` / `ctx.layout` readable at all — cordis THROWS on an undeclared
 * service instead of returning undefined.
 */
export const inject = ['slots', 'layout']

/**
 * Position of the row among the shell's own panel entries.
 *
 * The shell orders ascending: Plugins is 0, Scheduled tasks is 10. A negative
 * order keeps the chat row directly above Plugins, which is where it has always
 * been.
 */
const PANEL_ORDER = -10

/** Mount the panel surfaces. */
export function apply(ctx: ClientContext): void {
  let runtime: ChatRuntime | undefined

  // --- runtime first ------------------------------------------------------
  // Mounting it before registering means a runtime failure is already known when
  // the slots are registered, so a click reaches an explained failure instead of
  // a selected row with nothing behind it.
  try {
    runtime = mountRuntime(ctx.layout)
    clearDiagnosis()
  } catch (error) {
    console.error('[dsh-chat-deepseek] panel runtime failed:', error)
    try {
      showDiagnosis(diagnoseMountFailure(error))
    } catch {
      // Rendering the diagnosis must never be the thing that breaks.
    }
  }

  // --- main panel ---------------------------------------------------------
  // `inject` waits for the slot to be DECLARED (the shell declares `main` from its
  // root frame), so the registration follows the shell's lifetime instead of
  // polling the DOM.
  ctx.effect(
    () =>
      ctx.slots.inject('main', () => {
        const dispose = ctx.slots.register({ name: 'main', key: PANEL_ID }, DeepSeekPanel)
        // Restore the previous selection only now: `selectPanel` throws for a key
        // that is not in the registry yet.
        runtime?.restoreSelection()
        return dispose
      }),
    'dsh-chat-deepseek: main panel',
  )

  // --- sidebar row --------------------------------------------------------
  ctx.effect(
    () =>
      ctx.slots.inject('sidebar.panellist', () =>
        ctx.slots.register(
          {
            name: 'sidebar.panellist',
            id: PANEL_ID,
            order: PANEL_ORDER,
            label: () => '聊天',
          },
          DeepSeekIcon,
        ),
      ),
    'dsh-chat-deepseek: sidebar row',
  )

  ctx.effect(
    () => () => {
      runtime?.dispose()
      runtime = undefined
    },
    'dsh-chat-deepseek: runtime',
  )
}

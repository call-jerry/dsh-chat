/**
 * The `main` slot occupant: the DeepSeek panel.
 *
 * WHAT THIS COMPONENT IS — AND IS NOT
 * -----------------------------------
 * It renders NO chat UI. All it does is exist, so that:
 *
 *   1. the shell has a registered main panel with this key, which is what makes
 *      `layout.selectPanel('chat-deepseek')` legal at all (the layout service
 *      throws for an unregistered key);
 *   2. the centre column is handed to this plugin by the shell's own selection
 *      state, so mutual exclusion with Plugins / Scheduled tasks / the
 *      Conversation is the shell's job instead of a DOM race;
 *   3. the overlay knows where to draw itself. The element this component is
 *      mounted into IS the box the Conversation would have occupied, so it is
 *      measured directly (see anchor.ts) instead of guessing at column class
 *      names.
 *
 * The iframe deliberately does NOT live here. React unmounts this component the
 * moment another panel or a session is selected, and a destroyed tree would take
 * the iframe with it — reloading the SPA and losing an answer mid-stream. The
 * frame stays on `<body>` and only its placement is driven from this box.
 *
 * No props are read: everything arrives through the registries above and through
 * the proxy status the runtime fetches.
 */
import { createElement, useEffect, useRef } from 'react'
import { setPanelAnchor } from './anchor.ts'

/**
 * The box to cover, found by ancestry from a node this plugin owns.
 *
 * `[data-global-panel]` is the shell's own marker for "the centre column is
 * occupied by a global panel", which is exactly the state this component renders
 * in. `parentElement` is the fallback for a shell that renders the slot without
 * that marker — either way the element is the grid item, never a class-hash guess.
 *
 * @param host - this component's own root node.
 * @returns the box to cover, or undefined when the node is already detached.
 */
function boxOf(host: HTMLDivElement | null): HTMLElement | undefined {
  if (host === null) return undefined
  const marked = host.closest<HTMLElement>('[data-global-panel]')
  if (marked !== null) return marked
  return host.parentElement ?? undefined
}

/** The `main` slot occupant for the `chat-deepseek` key. */
export function DeepSeekPanel(): unknown {
  const host = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    setPanelAnchor(boxOf(host.current))
    // Leaving the panel = the shell re-rendered the slot with another key, so the
    // box is gone. Clearing it stops the overlay from chasing a detached node and
    // lets the runtime fall back to the viewport until the panel is selected
    // again.
    return () => setPanelAnchor(undefined)
  }, [])

  // An empty, layout-neutral host. It is never visible: the overlay covers this
  // area whenever the panel is selected, and the shell paints nothing here
  // otherwise.
  return createElement('div', {
    ref: host,
    'data-dsh-chat-deepseek-anchor': '',
    'aria-hidden': 'true',
    style: { width: '100%', height: '100%', pointerEvents: 'none' },
  })
}

/**
 * The main panel's box, published by the slot component and read by the overlay.
 *
 * WHY THIS EXISTS
 * ---------------
 * The chat surface is a fixed-position overlay on `<body>` (an iframe must never
 * be re-parented — Chrome reloads it on any DOM move, which would throw away the
 * page the user is looking at). The overlay therefore has to copy its rectangle
 * from the box the shell gave the main slot.
 *
 * The React component rendered into the `main` slot is the ONLY code that knows
 * where that box is: it is mounted inside it. Everything else (positioning, the
 * resize watcher) is plain DOM code outside React, so the element is handed over
 * through this tiny registry instead of being looked up by a CSS class name —
 * shell class names are CSS-module hashes and change between releases, while this
 * element is found by ancestry from a node we own.
 *
 * The registry holds at most ONE element: the slot renders a single panel.
 */

/** The element the overlay should cover, or undefined while the slot is unmounted. */
let anchor: HTMLElement | undefined

/** Listeners waiting for the anchor to appear, change or disappear. */
const listeners = new Set<() => void>()

/**
 * Publish (or clear) the panel box.
 *
 * @param element - the main slot's box, or undefined when the slot unmounted.
 */
export function setPanelAnchor(element: HTMLElement | undefined): void {
  if (anchor === element) return
  anchor = element
  for (const listener of listeners) {
    try {
      listener()
    } catch (error) {
      // A positioning failure must never break the React commit that published
      // the box: the next open would then never reposition.
      console.warn('[dsh-chat-deepseek] anchor listener failed:', error)
    }
  }
}

/** The element the overlay should cover, or undefined while the slot is unmounted. */
export function panelAnchor(): HTMLElement | undefined {
  return anchor
}

/**
 * Be told when the panel box appears, changes or disappears.
 *
 * @param listener - called with no arguments; read {@link panelAnchor} inside.
 * @returns unsubscribe.
 */
export function onPanelAnchorChange(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

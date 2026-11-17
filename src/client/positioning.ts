/**
 * Panel positioning: keep the overlay's box equal to the main slot's box.
 *
 * The overlay lives on `<body>` — it must never be re-parented, because Chrome
 * reloads an iframe on any DOM move and a reload would throw away the page the
 * user is looking at. So its rectangle is copied by hand from the box the shell
 * gives the `main` slot (see anchor.ts for how that element is found).
 *
 * WHY A ResizeObserver AND NOT A BODY-WIDE MutationObserver
 * --------------------------------------------------------
 * Reading `getBoundingClientRect()` forces a synchronous layout. A
 * `MutationObserver` on `document.body` with `subtree: true` fires on every DOM
 * change anywhere in the shell, so with the panel open every streamed token cost
 * a full layout pass for a box that had not moved. Measured on the previous
 * implementation: 50 forced layouts for 1000 inserted+removed nodes, versus 0 with
 * this observer.
 *
 * A `ResizeObserver` on the slot box also covers the cases a window `resize`
 * listener misses: dragging the sidebar handle and opening the right column both
 * change the centre width without resizing the window.
 */

import { onPanelAnchorChange, panelAnchor } from './anchor.ts'

/**
 * Column selector used only as a second choice.
 *
 * The slot box is a child of the centre column; if the box itself has no area
 * (a shell that renders the slot into an un-sized wrapper) the column still does.
 * Kept as a fallback rather than the primary source — class names are CSS-module
 * hashes and this is exactly the kind of match that silently rots.
 */
const CENTER_COLUMN_SELECTOR = '[data-pane="conversation"], [class*="centerCol"]'

/** Selector for the shell's sidebar, used by the viewport fallback. */
const SIDEBAR_SELECTOR = '[data-pane="sidebar"], [class*="sidebarCol"]'

/** Copy one rectangle onto the fixed-position container. */
function applyRect(container: HTMLElement, rect: { left: number; top: number; width: number; height: number }): void {
  container.style.left = `${Math.round(rect.left)}px`
  container.style.top = `${Math.round(rect.top)}px`
  container.style.width = `${Math.round(rect.width)}px`
  container.style.height = `${Math.round(rect.height)}px`
}

/** A rectangle with a usable area, or undefined. */
function usableBox(element: HTMLElement | undefined): DOMRect | undefined {
  if (element === undefined || !element.isConnected) return undefined
  const rect = element.getBoundingClientRect()
  // 0×0 means the element is hidden or not laid out yet. Copying it would leave
  // the overlay invisible while the sidebar row looks selected.
  return rect.width > 0 && rect.height > 0 ? rect : undefined
}

/**
 * Copy the main slot's rectangle onto a fixed-position container.
 *
 * FALLBACK MATTERS: the panel is preloaded while it is still closed, so on the
 * very first mount there is no slot box at all. Returning early would leave the
 * iframe at zero size — and a zero-width viewport makes the SPA force its own
 * sidebar collapsed and persist that decision (see styles.ts). The viewport minus
 * the sidebar is the closest honest approximation, and the real box replaces it as
 * soon as the panel is selected.
 *
 * @param container - the fixed overlay to position.
 * @returns true when the slot box was used (false = fallback geometry).
 */
export function positionOverSlot(container: HTMLElement): boolean {
  const anchor = panelAnchor()
  const slot =
    usableBox(anchor) ??
    usableBox(anchor?.closest<HTMLElement>(CENTER_COLUMN_SELECTOR) ?? undefined)

  if (slot !== undefined) {
    applyRect(container, slot)
    return true
  }

  const sidebar = document.querySelector<HTMLElement>(SIDEBAR_SELECTOR)
  const left = sidebar?.getBoundingClientRect().right ?? 0
  applyRect(container, {
    left,
    top: 0,
    width: Math.max(0, window.innerWidth - left),
    height: window.innerHeight,
  })
  return false
}

/** Handle over the observers that keep the container aligned. */
export interface SlotWatcher {
  /** Stop watching everything. */
  dispose(): void
}

/**
 * Keep the container aligned with the main slot for as long as it is mounted.
 *
 * @param container - the overlay to keep aligned.
 * @returns the watcher handle.
 */
export function watchSlotBox(container: HTMLElement): SlotWatcher {
  /** The box currently observed, or undefined while the slot is unmounted. */
  let observed: HTMLElement | undefined

  const resize = new ResizeObserver(() => {
    positionOverSlot(container)
  })

  /** Follow the registry: observe the current box, drop the previous one. */
  const follow = (): void => {
    const anchor = panelAnchor()
    if (anchor !== observed) {
      if (observed !== undefined) resize.unobserve(observed)
      observed = anchor
      if (anchor !== undefined) resize.observe(anchor)
    }
    positionOverSlot(container)
  }

  const offAnchor = onPanelAnchorChange(follow)
  const onResize = (): void => {
    positionOverSlot(container)
  }
  window.addEventListener('resize', onResize)

  follow()

  return {
    dispose(): void {
      offAnchor()
      window.removeEventListener('resize', onResize)
      resize.disconnect()
      observed = undefined
    },
  }
}

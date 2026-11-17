/**
 * The `sidebar.panellist` occupant: the glyph the shell paints inside its own
 * panel row.
 *
 * The row itself is the shell's — it renders the label, the active highlight
 * (`aria-current`) and the click behaviour (`layout.selectPanel(id)`). Registering
 * here instead of injecting a `<button>` into the sidebar is what removes the
 * whole class of "the entry highlights but no panel appears" bugs: the highlight
 * is the selection, so the two cannot disagree.
 *
 * Props are supplied by the row: `size` is 16px wide / 18px in the collapsed
 * rail, and `active` is true while this panel owns the centre column. The glyph
 * uses `currentColor`, so the row's own hover/active colours apply unchanged and
 * no active-state styling is needed here.
 */
import { createElement } from 'react'

/** Props the sidebar row passes to its panel icon. */
interface PanelIconProps {
  /** Square edge in pixels, chosen by the row for its current width. */
  size?: number
  /** Whether this panel is currently selected (unused: the row paints state). */
  active?: boolean
}

/** Chat bubble glyph, drawn to the shell's 16px nav-icon weight. */
export function DeepSeekIcon({ size = 16 }: PanelIconProps): unknown {
  return createElement(
    'svg',
    {
      viewBox: '0 0 24 24',
      width: size,
      height: size,
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: 1.75,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
      'aria-hidden': 'true',
      style: { display: 'block' },
    },
    createElement('path', {
      d: 'M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4Z',
    }),
  )
}

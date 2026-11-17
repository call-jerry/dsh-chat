/**
 * Inline styles for the DeepSeek chat surface. Injected once at runtime as a
 * `<style>` element: the host serves only `client.js` for a plugin, so CSS cannot
 * be a separate file. Everything rides the `--dsw-*` tokens so the panel follows
 * the active theme (light/dark and skins).
 *
 * The sidebar row needs NO styling here any more: it is the shell's own
 * `PanelRow`, rendered from the `sidebar.panellist` registration. That is the
 * whole point of the slot — row geometry, hover, `aria-current` highlight, the
 * collapsed rail and the More menu all come from the shell and cannot drift.
 *
 * HIDDEN WITH `visibility`, NEVER `display: none`
 * ----------------------------------------------
 * The frame is created while the panel is still closed (so opening it is instant).
 * Under `display: none` the iframe boots with a ZERO-WIDTH viewport, and the SPA
 * then initialises its own sidebar from
 *
 *   siderState = !matchMedia('(min-width: 1024px)').matches || persisted
 *                  ? 'collapsed' : 'expanded'
 *
 * A zero-width viewport fails that media query, so the SPA forced its sidebar
 * COLLAPSED on every restart and persisted that decision. Measured directly: an
 * iframe created in a `display: none` holder reports `innerWidth` 0 and the query
 * false; the same iframe in a `visibility: hidden` holder of the same size reports
 * the real width and the query true.
 */
export const STYLE_ID = 'dsh-chat-deepseek-styles'

export const STYLES = `
/* --- fixed overlay over the centre column ---------------------------------- */

/* Appended to <body>, NOT into the centre column: the column is owned by React and
   is torn down and rebuilt whenever the user switches session, workspace or panel,
   which would destroy an iframe nested inside it. Chrome reloads an iframe on any
   DOM move, so the only way to keep the SPA on the page the user left is to never
   let anything move it.

   Position is therefore fixed and driven from the main slot's rectangle (see
   positioning.ts), and this rule owns the position property exclusively. */
[data-dsh-chat-deepseek-view] {
  position: fixed;
  display: flex;
  /* MUST be column: the toolbar and the iframe stack vertically, and the frame's
     flex:1 then claims the remaining height. In the default row direction they
     would sit side by side and the frame would be squeezed. */
  flex-direction: column;
  visibility: hidden;
  pointer-events: none;
  z-index: 60;
  box-sizing: border-box;
  overflow: hidden;
  background: var(--dsw-alias-bg-base, #ffffff);
  color: var(--dsw-alias-label-primary, #2c2c2a);
  font-family: var(--dsw-font-family, inherit);
}

/* Shown exactly while the shell has this panel selected. Driven by the runtime,
   which sets the attribute from layout.panelInfo — the same store the sidebar
   row's highlight comes from, so the two cannot disagree. */
[data-dsh-chat-deepseek-view][data-open] {
  visibility: visible;
  pointer-events: auto;
}

/* --- panel chrome ---------------------------------------------------------- */

/* Toolbar above the frame: title + refresh + open-in-browser. */
.dsh-chat-deepseek-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: none;
  height: 40px;
  padding: 0 10px;
  border-bottom: 1px solid var(--dsw-alias-separator, rgba(128, 128, 128, 0.2));
  background: var(--dsw-alias-bg-base, #ffffff);
}
.dsh-chat-deepseek-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--dsw-alias-label-primary, #2c2c2a);
}
.dsh-chat-deepseek-spacer {
  flex: 1 1 auto;
}
.dsh-chat-deepseek-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 26px;
  padding: 0 10px;
  border: 1px solid var(--dsw-alias-separator, rgba(128, 128, 128, 0.3));
  border-radius: 6px;
  background: transparent;
  color: var(--dsw-alias-label-secondary, #5f5e5a);
  font-size: 12px;
  cursor: pointer;
  white-space: nowrap;
}
.dsh-chat-deepseek-btn:hover {
  background: var(--dsw-specific-sidebar-nav-item-hover, rgba(128, 128, 128, 0.12));
  color: var(--dsw-alias-label-primary, #2c2c2a);
}

/* The frame itself fills everything below the toolbar. */
.dsh-chat-deepseek-frame {
  flex: 1 1 auto;
  width: 100%;
  min-height: 0;
  border: 0;
  display: block;
  background: var(--dsw-alias-bg-base, #ffffff);
}

/* Loading / failure state shown instead of the frame. */
.dsh-chat-deepseek-state {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 24px;
  text-align: center;
  font-size: 13px;
  color: var(--dsw-alias-label-secondary, #5f5e5a);
}
.dsh-chat-deepseek-state-error {
  color: #c0392b;
  max-width: 560px;
  line-height: 1.6;
}
.dsh-chat-deepseek-state code {
  font-family: var(--dsw-font-family-mono, ui-monospace, monospace);
  font-size: 12px;
  padding: 2px 5px;
  border-radius: 4px;
  background: rgba(128, 128, 128, 0.15);
}
`

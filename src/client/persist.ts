/**
 * Persistence for the panel's open state, so a page reload restores the chat
 * panel instead of dropping back to the conversation.
 *
 * Best-effort: disabled storage degrades to no-restore and never throws.
 */

const ACTIVE_PANEL_KEY = 'dsh-chat-deepseek:active-panel'

export type ActivePanel = 'chat' | ''

export function getActivePanel(): ActivePanel {
  try {
    return localStorage.getItem(ACTIVE_PANEL_KEY) === 'chat' ? 'chat' : ''
  } catch {
    return ''
  }
}

export function setActivePanel(panel: ActivePanel): void {
  try {
    if (panel === '') localStorage.removeItem(ACTIVE_PANEL_KEY)
    else localStorage.setItem(ACTIVE_PANEL_KEY, panel)
  } catch {
    /* storage unavailable — ignore */
  }
}

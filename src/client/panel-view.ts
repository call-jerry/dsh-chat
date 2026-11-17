/**
 * The panel's chrome: a toolbar plus the one iframe that shows the SPA.
 *
 * THE IFRAME IS CREATED ONCE
 * --------------------------
 * Chrome reloads an iframe on any DOM move, and a reload would throw away the
 * page the user is looking at — including an in-flight answer. So the frame is
 * never re-parented, never rebuilt on open/close, and only replaced by an explicit
 * user "refresh". That is also why this container lives on `<body>` rather than
 * inside the React-owned center column.
 */

/** What the caller can do with the panel. */
export interface PanelView {
  /** The fixed-position container to attach to `<body>`. */
  container: HTMLDivElement
  /** Attach (or re-point) the iframe at a URL. */
  showFrame(url: string): void
  /** Replace the frame with a status line (loading, or an error). */
  showState(text: string, isError: boolean): void
  /** Whether an iframe currently exists. */
  hasFrame(): boolean
}

/**
 * Build the panel chrome.
 *
 * @param onRefresh - user asked to reload the chat page.
 * @param onOpenExternal - user asked to open the site in the system browser.
 * @returns the panel view.
 */
export function createPanel(onRefresh: () => void, onOpenExternal: () => void): PanelView {
  const container = document.createElement('div')
  // Identity is the data attribute (what styles.ts and the tests select on);
  // `data-dsh-plugin` is the cross-plugin marker the other overlays also carry.
  container.dataset.dshChatDeepseekView = ''
  container.dataset.dshPlugin = 'chat-deepseek'

  const bar = document.createElement('div')
  bar.className = 'dsh-chat-deepseek-bar'

  const title = document.createElement('span')
  title.className = 'dsh-chat-deepseek-title'
  title.textContent = 'DeepSeek Chat'

  const spacer = document.createElement('span')
  spacer.className = 'dsh-chat-deepseek-spacer'

  const refresh = document.createElement('button')
  refresh.type = 'button'
  refresh.className = 'dsh-chat-deepseek-btn'
  refresh.textContent = '刷新'
  refresh.title = '重新加载对话页面'
  refresh.addEventListener('click', onRefresh)

  const external = document.createElement('button')
  external.type = 'button'
  external.className = 'dsh-chat-deepseek-btn'
  external.textContent = '在浏览器打开'
  external.title = '在系统浏览器中打开 chat.deepseek.com'
  external.addEventListener('click', onOpenExternal)

  bar.append(title, spacer, refresh, external)
  container.append(bar)

  /** The single iframe. Created once; only an explicit refresh replaces it. */
  let frame: HTMLIFrameElement | undefined
  /** The placeholder shown while loading or on failure. */
  let state: HTMLDivElement | undefined

  const clearState = (): void => {
    state?.remove()
    state = undefined
  }

  const showState = (text: string, isError: boolean): void => {
    clearState()
    state = document.createElement('div')
    state.className = 'dsh-chat-deepseek-state'
    const line = document.createElement('div')
    if (isError) line.className = 'dsh-chat-deepseek-state-error'
    line.textContent = text
    state.append(line)
    container.append(state)
  }

  const showFrame = (url: string): void => {
    clearState()
    frame?.remove()
    frame = document.createElement('iframe')
    frame.className = 'dsh-chat-deepseek-frame'
    frame.title = 'DeepSeek Chat'
    // allow-same-origin is required: the SPA stores its session in origin-scoped
    // storage and its own cookies; without it login cannot persist. scripts and
    // forms are what the SPA needs to function at all.
    frame.setAttribute(
      'sandbox',
      'allow-scripts allow-same-origin allow-forms allow-popups allow-downloads allow-modals',
    )
    frame.setAttribute('allow', 'clipboard-write; microphone')
    frame.src = url
    container.append(frame)
  }

  return {
    container,
    showFrame,
    showState,
    hasFrame: () => frame !== undefined,
  }
}

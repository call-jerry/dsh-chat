/**
 * Self-diagnosis surface.
 *
 * The packaged GUI has no devtools (F12 is development-only), so a failure that
 * only reaches `console.warn` is invisible to the user — which is exactly how
 * "the entry highlights but no panel appears" can look like nothing happened.
 *
 * This renders the plugin's own state into the page: mount errors, whether the
 * overlay exists, its computed geometry, the proxy status, and any sibling
 * activation attributes. It is shown ONLY when something is wrong, so a healthy
 * install never sees it.
 */

/** Collected facts about one failed or suspicious state. */
export interface Diagnosis {
  /** Human-readable headline. */
  headline: string
  /** Ordered detail lines (label: value). */
  lines: Array<[string, string]>
}

/** Element id of the diagnostic panel (idempotent rendering). */
const DIAGNOSIS_ID = 'dsh-chat-deepseek-diagnosis'

/**
 * Render (or refresh) the diagnostic panel.
 *
 * @param diagnosis - facts to display.
 */
export function showDiagnosis(diagnosis: Diagnosis): void {
  let host = document.getElementById(DIAGNOSIS_ID)
  if (host === null) {
    host = document.createElement('div')
    host.id = DIAGNOSIS_ID
    host.style.cssText = [
      'position:fixed',
      'right:16px',
      'bottom:16px',
      'z-index:2147483647',
      'max-width:520px',
      'max-height:60vh',
      'overflow:auto',
      'padding:12px 14px',
      'border-radius:10px',
      'border:1px solid #c0392b',
      'background:#fff',
      'color:#2c2c2a',
      'font:12px/1.6 ui-monospace,SFMono-Regular,Menlo,monospace',
      'box-shadow:0 8px 28px rgba(0,0,0,.22)',
      'white-space:pre-wrap',
    ].join(';')
    document.body.appendChild(host)
  }

  const head = document.createElement('div')
  head.textContent = '⚠ ' + diagnosis.headline
  head.style.cssText = 'font-weight:700;color:#c0392b;margin-bottom:8px'

  const body = document.createElement('div')
  body.textContent = diagnosis.lines.map(([k, v]) => `${k}: ${v}`).join('\n')

  const close = document.createElement('button')
  close.type = 'button'
  close.textContent = '关闭'
  close.style.cssText =
    'margin-top:10px;padding:3px 10px;border:1px solid #c0392b;border-radius:6px;background:transparent;color:#c0392b;cursor:pointer;font:inherit'
  close.addEventListener('click', () => {
    host?.remove()
  })

  host.replaceChildren(head, body, close)
}

/** Remove the diagnostic panel (used once the plugin recovers). */
export function clearDiagnosis(): void {
  document.getElementById(DIAGNOSIS_ID)?.remove()
}

/**
 * Describe why the panel could not be shown, in terms a user can act on.
 *
 * @param error - the thrown value, if any.
 * @returns a diagnosis ready to render.
 */
export function diagnoseMountFailure(error: unknown): Diagnosis {
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
  const lines: Array<[string, string]> = [['错误', message]]
  if (error instanceof Error && error.stack !== undefined) {
    const frame = error.stack.split('\n').find((l) => l.includes('dsh-chat-deepseek'))
    if (frame !== undefined) lines.push(['位置', frame.trim()])
  }
  lines.push(['样式已注入', String(document.getElementById('dsh-chat-deepseek-styles') !== null)])
  lines.push(['覆盖层存在', String(document.querySelector('[data-dsh-chat-deepseek-view]') !== null)])
  // Only present while the shell has this panel selected: it is the box the
  // overlay copies its geometry from, so its absence explains a mispositioned or
  // invisible panel.
  lines.push(['主槽锚点', String(document.querySelector('[data-dsh-chat-deepseek-anchor]') !== null)])
  lines.push(['页面地址', location.href.slice(0, 80)])
  return { headline: 'DeepSeek 面板未能挂载', lines }
}

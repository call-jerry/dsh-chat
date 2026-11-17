/**
 * Local same-origin reverse proxy in front of chat.deepseek.com.
 *
 * WHY THIS EXISTS
 * ---------------
 * chat.deepseek.com sends `content-security-policy: frame-ancestors 'none'`,
 * so the browser refuses to render it inside any iframe. A Chrome extension can
 * delete that header with `declarativeNetRequest`; a DSH plugin runs in the
 * Host's Node process and has no access to Chromium's network stack. The
 * equivalent a plugin CAN do is terminate the connection itself: this server
 * talks to DeepSeek and re-emits the response with the framing headers removed.
 * The GUI then points its iframe at `http://127.0.0.1:<port>/`.
 *
 * WHY ITS OWN PORT, NOT A HOST ROUTE PREFIX
 * -----------------------------------------
 * The SPA issues absolute root-path requests (`/api/v0/chat/completion`, ...)
 * and its router owns `/` and `/sign_in`. Mounting the proxy under a DSH route
 * prefix would make every one of those requests miss the proxy and hit the DSH
 * Host instead. Serving on a dedicated loopback port keeps the upstream paths
 * byte-identical, so nothing needs rewriting to work.
 *
 * THE THREE REWRITES, AND WHY EACH IS REQUIRED
 * --------------------------------------------
 * 1. Framing headers (`content-security-policy`, `x-frame-options`) removed —
 *    otherwise the iframe is refused outright.
 * 2. Static host folded in. The SPA loads JS/CSS/fonts/wasm from
 *    `fe-static.deepseek.com`, whose CORS answer is the invalid wildcard
 *    `https://*.deepseek.com`; from a 127.0.0.1 origin the browser blocks all
 *    of it and the page dies on its error screen. Those URLs are rewritten to
 *    this origin's `/__static/` prefix, and HTML/CSS/JS bodies are rewritten to
 *    match. Only 8 font URLs in the CSS and 1 wasm path in the JS are affected.
 * 3. Cookies rebound to this origin: upstream `Domain=` and `Secure` are
 *    dropped (the proxy is plain http on loopback), so the login session is
 *    stored for 127.0.0.1 and survives reloads. That is what makes "log in
 *    once, then click to use" work.
 */

import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { request as httpsRequest } from 'node:https'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

/** Chat origin that serves the SPA shell and the `/api/v0/*` backend. */
export const CHAT_HOST = 'chat.deepseek.com'

/** Static CDN origin for the SPA's JS, CSS, fonts and wasm. */
export const STATIC_HOST = 'fe-static.deepseek.com'

/**
 * Path prefix under which the static CDN is re-exposed on this origin.
 * Deliberately outside `/api/` so it can never collide with the SPA's own API
 * namespace.
 */
export const STATIC_PREFIX = '/__static'

/** Default loopback port; the caller may override it in config. */
export const DEFAULT_PORT = 18190

/**
 * Namespace of the SPA's JSON backend.
 *
 * Requests under this prefix are streamed through untouched: their bodies are
 * never rewritten, so they may stay compressed. Everything else is forced to
 * `accept-encoding: identity` because this proxy rewrites document and asset
 * bodies (see `handleProxy`).
 */
const API_PREFIX = '/api/'

/**
 * How long an upstream socket may sit completely idle before it is destroyed.
 *
 * A completion stream can legitimately take minutes, so the server's own request
 * timeout is disabled; this cap is what stops a half-dead peer from holding a
 * socket (and its buffers) forever. It is an IDLE timer: every byte resets it.
 */
const UPSTREAM_IDLE_TIMEOUT_MS = 10 * 60_000

/** Hop-by-hop headers that must not be forwarded (RFC 7230 §6.1). */
const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
])

/**
 * Response headers dropped on the way out.
 *
 * The framing two make embedding impossible; `strict-transport-security` is
 * dropped because this origin is plain http on loopback; the CORS five are
 * dropped because upstream answers with a wildcard that is invalid for this
 * origin and the static host is now same-origin anyway.
 */
const STRIPPED_RESPONSE_HEADERS = new Set([
  'content-security-policy',
  'content-security-policy-report-only',
  'x-frame-options',
  'strict-transport-security',
  'access-control-allow-origin',
  'access-control-allow-credentials',
  'access-control-allow-methods',
  'access-control-allow-headers',
  'access-control-expose-headers',
  'access-control-max-age',
])

/**
 * Request headers replaced or removed before going upstream.
 *
 * DELIBERATELY MINIMAL. An earlier version also dropped `origin`, `referer` and
 * the `sec-fetch-*` triple, which was a mistake: those are exactly the headers a
 * real browser navigation always sends, and a request lacking them looks more
 * like a script than the browser it claims to be. Testing confirmed the site
 * answers identically with or without them, so there is nothing to gain by
 * removing them and a fingerprinting cost in doing so.
 *
 * Only genuinely unusable headers are dropped:
 *   - `host`          rewritten to the upstream host below.
 *   - `connection`    hop-by-hop.
 *   - `accept-encoding` is NOT dropped, but it is constrained below: bodies that
 *     get rewritten must arrive uncompressed.
 */
const DROPPED_REQUEST_HEADERS = new Set(['host', 'connection'])

/**
 * Drop the attributes that bind an upstream cookie to `*.deepseek.com`, so the
 * browser stores it for the proxy origin instead.
 *
 * `Secure` goes too: the proxy is `http://127.0.0.1`, and a Secure cookie is
 * never stored or sent over http, which would silently break login.
 *
 * @param raw - one upstream Set-Cookie header value.
 * @returns the same cookie minus `Domain` and `Secure`.
 */
export function rebindSetCookie(raw: string): string {
  return raw
    .split(';')
    .filter((part) => {
      const name = part.split('=')[0]?.trim().toLowerCase()
      return name !== 'domain' && name !== 'secure'
    })
    .join(';')
}

/**
 * Single-pass pattern for every rewrite `rewriteBody()` performs.
 *
 * ORDER MATTERS: `https://<static>` must be tried before `//<static>`, otherwise
 * the protocol-relative alternative would match the `//` inside the absolute URL
 * and leave a stray `https:` behind. The SRI alternative is last and captures its
 * value so the replacer can tell it apart from a URL match.
 */
const REWRITE_PATTERN = new RegExp(
  [
    `https://${STATIC_HOST.replaceAll('.', '\\.')}`,
    `//${STATIC_HOST.replaceAll('.', '\\.')}`,
    `https://${CHAT_HOST.replaceAll('.', '\\.')}`,
    // The unquoted alternative must stop at `>` or whitespace: `\S+` alone would
    // swallow the rest of the tag (`integrity=sha384-x></script>`), which
    // truncated the markup. Quoted values are bounded by their own quote.
    String.raw`\s+integrity\s*=\s*(?:"sha[^"]*"|'sha[^']*'|sha[^\s>]+)`,
  ].join('|'),
  'gi',
)

/**
 * Rewrite the upstream origins that appear inside a response body so the
 * browser addresses them on this origin.
 *
 * Applied to HTML (script/link tags), CSS (`url()` fonts) and JS (the wasm
 * path). A plain string replace is safe here: these are literal absolute URLs,
 * and the replacements only ever shorten the origin part.
 *
 * SRI attributes are stripped from HTML as well. The shell ships
 * `integrity="sha384-..."` on both bundles; once a bundle's URL is rewritten the
 * browser still verifies the ORIGINAL bytes, so the check fails and the SPA
 * falls back to its "页面资源加载异常" error screen. The hash cannot be recomputed
 * here (the body is rewritten lazily and a second pass would be needed for every
 * asset), so the attribute is removed — these are our own proxy's responses over
 * loopback, and `onerror` handlers stay intact.
 *
 * @param body - response body text.
 * @returns the body with static-CDN and chat-origin URLs pointed locally.
 */
export function rewriteBody(body: string): string {
  // ONE pass, not four. Each `replaceAll` allocates a whole new string, and the
  // bodies here are up to ~1.6 MiB of JS, so the sequential version churned
  // several copies of the bundle on every cold load. The alternatives are ordered
  // longest-first so `https://host` is consumed before the protocol-relative
  // `//host` inside it can match on its own.
  return body.replace(REWRITE_PATTERN, (match: string) => {
    // The SRI alternative is the only one that starts with whitespace and the
    // attribute name; it is dropped entirely (see the note above).
    if (match.trimStart().toLowerCase().startsWith('integrity')) return ''
    // Static-CDN URLs (absolute or protocol-relative) become same-origin paths;
    // absolute links to the chat origin become relative ones.
    if (match.includes(STATIC_HOST)) return STATIC_PREFIX
    return ''
  })
}

/**
 * Script injected into proxied HTML documents, BEFORE any of the SPA's own code.
 *
 * WHY THE WECHAT QR CANNOT WORK HERE
 * ----------------------------------
 * Short version: WeChat OAuth cannot be completed inside this panel, and nothing a
 * plugin can do changes that. The shim therefore replaces the QR with a notice. This
 * block records the investigation so the conclusion is not re-litigated later.
 *
 * Two things break first, both caused by the page's host being `127.0.0.1` instead
 * of `chat.deepseek.com`. The SPA decides both from `location.hostname`:
 *
 *   1. ENVIRONMENT. Its `hostname` switch returns "dev" for any IP literal:
 *        if (hostname.match(/(\d{1,3}\.){3,3}\d{1,3}/)) return "dev"
 *      The QR widget's appId is chosen from that environment, so a dev build's
 *      appId is used.
 *   2. REDIRECT_URI. It builds
 *        redirect_uri = encodeURIComponent(location.origin + API_BASE + '/oauth/wechat/callback')
 *      and WeChat only accepts a redirect_uri on the appId's registered domain.
 *
 * Together, `open.weixin.qq.com/connect/qrconnect` answers with an error page:
 *
 *   <title>抱歉，出错了</title>   <div class="weui_msg_title">redirect_uri 参数错误</div>
 *
 * and the QR iframe stays blank — exactly the reported symptom.
 *
 * Verified against the live endpoint: appId wx932d4fdaf46d5611 (production) with
 * redirect_uri https://chat.deepseek.com/... returns a 43 KiB page containing a real
 * QR uuid, while the dev appId returns the 882-byte error page for every redirect_uri
 * variant, loopback or not.
 *
 * WHY NOT SPOOF `location`
 * ------------------------
 * Redefining `location.origin` is impossible: Chrome makes location's properties
 * non-configurable, so `Object.defineProperty` throws "Cannot redefine property:
 * origin", and `window.location` itself cannot be replaced either. Both were tested.
 *
 * An earlier revision wrapped `window.WxLogin` to rewrite both fields, which did make
 * a real QR render. It was reverted because the login still cannot complete:
 *
 * WHY THE SCAN "DOES NOTHING" AFTER SUCCEEDING
 * --------------------------------------------
 * Once the code is scanned, WeChat's own script does (from the QR page):
 *
 *   window.top.location = jsdata.redirect_url      // redirect_url = the callback
 *
 * Inside DSH, `window.top` is the DSH GUI itself — not this panel. The iframe is
 * sandboxed, so that top-level navigation is blocked and the panel simply keeps
 * showing the QR: the scan succeeds and nothing happens. With self_redirect=true the
 * frame does navigate, but it lands on chat.deepseek.com — a different origin, where
 * the cookie is set and which the panel cannot read.
 *
 * And WeChat sends no postMessage to the parent (verified: the panel received an
 * empty message array), so there is no way to hand the result back either.
 *
 * So the shim now just explains the situation where the QR would be. Only the WeChat
 * widget is touched: phone/SMS/password login, the chat itself and all API traffic
 * keep using the loopback origin unchanged.
 */
const WECHAT_SHIM = `<script data-dsh-proxy-shim>(function(){
  /**
   * REPLACE THE QR WITH A NOTICE.
   *
   * WeChat OAuth cannot be completed inside this panel, and the reason is not
   * fixable at the plugin level:
   *
   *   1. qrconnect only accepts a redirect_uri on the appId's REGISTERED domain.
   *      Verified against the live endpoint: https://chat.deepseek.com/... returns a
   *      43 KiB QR page, while http://127.0.0.1, https://127.0.0.1 and
   *      http://localhost all return the 882-byte "redirect_uri 参数错误" page.
   *   2. So the OAuth code is only ever delivered to chat.deepseek.com, and the
   *      session cookie is set there. This panel runs on 127.0.0.1, a different
   *      origin: it can neither read that cookie nor receive the code.
   *   3. Serving the panel from chat.deepseek.com would need the browser to resolve
   *      that name to 127.0.0.1 plus a trusted certificate for it — i.e. editing the
   *      hosts file and installing a CA. A plugin cannot do that.
   *
   * The WeChat TAB is kept (removing it would be more surprising than explaining
   * it), but the QR area shows a notice instead of a code that can be scanned and
   * then goes nowhere.
   *
   * PHONE/SMS/PASSWORD LOGIN IS UNAFFECTED and remains the supported path.
   */
  var NOTICE_TEXT = '微信登录暂不可用';

  /**
   * Build the notice block that replaces the QR.
   *
   * Sized 200x200 to match the real QR iframe exactly (the slot is 238x200 and centres
   * its child, so this lands on the same pixels and nothing reflows).
   */
  function makeNotice() {
    var box = document.createElement('div');
    box.setAttribute('data-dsh-wechat-notice', '');
    box.textContent = NOTICE_TEXT;
    box.style.cssText = [
      'display:flex',
      'align-items:center',
      'justify-content:center',
      'box-sizing:border-box',
      'flex:0 0 auto',
      'margin:0',
      'padding:16px',
      'width:200px',
      'height:200px',
      'border-radius:8px',
      'border:1px dashed currentColor',
      // NOT "color: inherit": the slot inherits the document default, which computes
      // to purple, so the text came out pink. The colour is set explicitly below.
      'color:#8a8f98',
      'opacity:.75',
      'font-size:13px',
      'line-height:1.6',
      'text-align:center',
      'user-select:none',
    ].join(';');
    return box;
  }

  /**
   * Put the notice where the QR would be.
   *
   * ONLY into the widget's own container (id "wxLogin"). That container is the QR
   * slot: 238x200 inside the 240px-wide WeChat block, with the "微信扫码登录" label
   * stacked above it. Filling it inherits the page's own layout, so nothing moves.
   *
   * Do NOT fall back to a nearby ancestor. The WeChat block is a 240px flex row, so
   * inserting the notice as the label's sibling squeezes the label to 40px, its text
   * turns vertical and the notice is pinned to its right — the whole column reads as
   * misaligned. If the container is not there yet, wait: the observer below runs long
   * enough for React to render it.
   */
  function showNotice() {
    var slot = document.querySelector('#wxLogin, [id*="wxLogin"]');
    if (slot === null) return false;

    if (slot.querySelector('[data-dsh-wechat-notice]') !== null) return true;
    // A real QR is present (e.g. WeChat relaxed its policy) — leave it alone.
    if (slot.querySelector('iframe') !== null) return true;

    var box = makeNotice();
    // Borrow the page's own text colour so light/dark mode both look native.
    var label = document.querySelector('[class*="wechat-block__description"]');
    if (label !== null) {
      var inherited = window.getComputedStyle(label).color;
      if (inherited !== '') box.style.color = inherited;
    }
    slot.appendChild(box);
    return true;
  }

  /**
   * Belt and braces: stop the widget from ever rendering.
   *
   * The SPA loads the vendor script and calls new window.WxLogin(...). Neutralising
   * the global means no dead QR can appear, whatever path selects the WeChat tab.
   * The empty container is then filled with the notice by showNotice().
   */
  function neutralise() {
    function Stub() {}
    Stub.prototype = { __dshDisabled: true };
    try {
      Object.defineProperty(window, 'WxLogin', {
        configurable: true,
        get: function () { return Stub; },
        set: function () { /* ignore the vendor assignment */ },
      });
    } catch (e) {
      /* a locked-down window: the notice below still applies */
    }
  }

  neutralise();

  /**
   * The QR slot is rendered only once the WeChat tab is selected, which can happen at
   * any time — right after load if that tab is restored, or minutes later when the
   * user clicks it. So: watch the DOM for the first few seconds (covers the restored
   * case), and re-check after any click (covers the manual case) instead of keeping a
   * subtree observer on the whole document forever.
   */
  function recheck() {
    if (document.querySelector('[data-dsh-wechat-notice]') !== null) return;
    showNotice();
  }

  function recheckAfterClick() {
    if (document.querySelector('[data-dsh-wechat-notice]') !== null) return;
    recheck();
    // React renders on the next frame, so follow up a few times.
    setTimeout(recheck, 80);
    setTimeout(recheck, 300);
    setTimeout(recheck, 900);
  }

  try {
    var observer = new MutationObserver(function () { showNotice(); });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    // Stop watching once the page settles, so this does not run forever.
    setTimeout(function () { observer.disconnect(); }, 15000);
  } catch (e) {}

  showNotice();
  document.addEventListener('DOMContentLoaded', showNotice, false);
  document.addEventListener('click', recheckAfterClick, true);
})();</script>`

/**
 * Script that keeps DeepSeek's share links pointing at the PUBLIC site.
 *
 * WHY: the share URL is built by the SPA as
 *
 *   new URL('/share/' + shareId, window.location.href).href
 *
 * i.e. resolved against whatever origin the page runs on. Inside this panel that is
 * http://127.0.0.1:<proxy port>, so "create and copy" hands the user a link that only
 * works on their own machine. The share itself is created server-side (the id is
 * real), so the link is fine — only the origin it is written with is wrong.
 *
 * `location` cannot be redefined (its properties are non-configurable), so the origin
 * is corrected at the three points where the string is USED:
 *
 *   1. navigator.clipboard.writeText - the button copies through this;
 *   2. the `copy` event - covers execCommand/shortcut copies of a selection;
 *   3. displayed text and <input value> - so the dialog does not show the local form.
 *
 * Only `/share/` URLs are rewritten: a chat or API URL must keep pointing here.
 * No template literals in this script — the surrounding constant is one, and a stray
 * backtick silently truncates it.
 */
const SHARE_SHIM = `<script data-dsh-proxy-shim>(function(){
  var PUBLIC_ORIGIN = 'https://chat.deepseek.com';
  var NEEDLE_PATH = '/share/';

  function localOrigin() {
    return window.location.origin;
  }

  /** Swap the local origin for the public one on /share/ URLs only. */
  function rewrite(text) {
    if (typeof text !== 'string' || text === '') return text;
    var needle = localOrigin() + NEEDLE_PATH;
    if (text.indexOf(needle) === -1) return text;
    return text.split(needle).join(PUBLIC_ORIGIN + NEEDLE_PATH);
  }

  // 1. The clipboard API. The bundle's "create and copy" calls this directly.
  try {
    var clip = navigator.clipboard;
    if (clip && typeof clip.writeText === 'function') {
      var writeText = clip.writeText;
      // Shadowing on the instance keeps the rest of the API untouched.
      clip.writeText = function (text) {
        return writeText.call(clip, rewrite(text));
      };
    }
  } catch (e) {
    /* clipboard blocked: the copy listener below still covers keyboard copies */
  }

  // 2. Selection-based copies (Ctrl+C, document.execCommand('copy')).
  function selectedText() {
    var el = document.activeElement;
    if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') &&
        typeof el.selectionStart === 'number') {
      return String(el.value).slice(el.selectionStart, el.selectionEnd);
    }
    var selection = window.getSelection ? window.getSelection() : null;
    return selection === null ? '' : String(selection);
  }

  document.addEventListener('copy', function (event) {
    var text = selectedText();
    var fixed = rewrite(text);
    if (fixed === text) return;
    if (event.clipboardData === null || event.clipboardData === undefined) return;
    event.preventDefault();
    event.clipboardData.setData('text/plain', fixed);
  }, true);

  // 3. What the dialog SHOWS. React owns these nodes, so this is applied on demand
  //    (after a click) rather than with a permanent observer, and it is idempotent:
  //    once rewritten the node no longer contains the needle.
  function sweep() {
    var needle = localOrigin() + NEEDLE_PATH;
    if (document.body === null) return;
    var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
    var node;
    while ((node = walker.nextNode()) !== null) {
      var value = node.nodeValue;
      if (value !== null && value.indexOf(needle) !== -1) {
        node.nodeValue = value.split(needle).join(PUBLIC_ORIGIN + NEEDLE_PATH);
      }
    }
    var fields = document.querySelectorAll('input, textarea');
    for (var i = 0; i < fields.length; i++) {
      var field = fields[i];
      if (typeof field.value === 'string' && field.value.indexOf(needle) !== -1) {
        field.value = field.value.split(needle).join(PUBLIC_ORIGIN + NEEDLE_PATH);
      }
    }
  }

  // The share dialog is only on screen for a moment, and React may paint it a frame
  // or two after the click, so follow up a few times.
  document.addEventListener('click', function () {
    sweep();
    setTimeout(sweep, 120);
    setTimeout(sweep, 400);
    setTimeout(sweep, 1200);
  }, true);

  // A restored share page or a deep link can already contain the string.
  document.addEventListener('DOMContentLoaded', sweep, false);
})();</script>`

/**
 * Inject the page shims into an HTML document.
 *
 * Placed immediately after `<head>` (or after `<html>`, or at the very start) so the
 * `WxLogin` accessor is installed before the vendor script assigns it.
 *
 * @param html - the upstream document.
 * @returns the document with the shims inserted once.
 */
export function injectOriginShim(html: string): string {
  // Idempotent: a second pass over the same document must not add a second shim.
  if (html.includes('data-dsh-proxy-shim')) return html

  const shims = WECHAT_SHIM + SHARE_SHIM
  for (const anchor of [/<head[^>]*>/i, /<html[^>]*>/i]) {
    const match = anchor.exec(html)
    if (match !== null) {
      const at = match.index + match[0].length
      return html.slice(0, at) + shims + html.slice(at)
    }
  }
  return shims + html
}

/**
 * Whether a content type carries text that may contain rewritable URLs. */
function isRewritableType(contentType: string | undefined): boolean {
  if (contentType === undefined) return false
  return (
    contentType.includes('text/html') ||
    contentType.includes('text/css') ||
    contentType.includes('javascript') ||
    contentType.includes('ecmascript')
  )
}

/**
 * Decide which upstream host and path an incoming request maps to.
 *
 * `/__static/...` goes to the CDN with the prefix removed; everything else goes
 * to the chat origin unchanged.
 *
 * @param requestPath - the incoming pathname plus query string.
 * @returns the upstream host and path.
 */
export function resolveTarget(requestPath: string): { host: string; path: string } {
  if (requestPath === STATIC_PREFIX || requestPath.startsWith(STATIC_PREFIX + '/')) {
    const rest = requestPath.slice(STATIC_PREFIX.length)
    return { host: STATIC_HOST, path: rest === '' ? '/' : rest }
  }
  return { host: CHAT_HOST, path: requestPath }
}

/**
 * Copy a request's headers, rewriting only the ones that pin the upstream
 * origin.
 *
 * `accept-encoding` is forced to `identity` ONLY when this response's body will
 * be rewritten, because a rewritten body must arrive uncompressed. The caller
 * decides that (see `handleProxy`): documents and the static prefix, nothing
 * else. Every other request keeps the browser's real `accept-encoding`, so API
 * calls are compressed exactly as they would be natively — passing the
 * browser's own value through is faster and less fingerprintable than stripping
 * compression from the whole session.
 *
 * @param req - incoming request.
 * @param host - upstream host to address.
 * @param needsIdentity - true when this response's body may need string rewriting.
 * @returns headers for the upstream request.
 */
function upstreamHeaders(
  req: IncomingMessage,
  host: string,
  needsIdentity: boolean,
): Record<string, string | string[]> {
  const headers: Record<string, string | string[]> = {}
  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined) continue
    if (DROPPED_REQUEST_HEADERS.has(key.toLowerCase())) continue
    headers[key] = value
  }
  headers['host'] = host
  if (needsIdentity) headers['accept-encoding'] = 'identity'
  return headers
}

/**
 * Rewrite a redirect target that points at the upstream chat origin so it stays on
 * this proxy instead.
 *
 * WHY: the WeChat callback answers `307 Location: /sign_in?provider=WECHAT&code=...`
 * — already relative, so it is fine — but other flows (and the site itself) emit
 * absolute `https://chat.deepseek.com/...` targets. Following one of those would
 * leave the proxy and drop the session on the wrong origin, so any absolute chat URL
 * is turned into a root-relative one (which the browser resolves against this
 * origin).
 *
 * @param value - the upstream Location header value.
 * @returns the same target, re-rooted on this origin when it pointed upstream.
 */
export function rebaseLocation(value: string): string {
  const trimmed = value.trim()
  const absolute = new RegExp(`^https?://${CHAT_HOST.replaceAll('.', '\\.')}(?=/|$)`, 'i')
  if (absolute.test(trimmed)) return trimmed.replace(absolute, '')
  const protocolRelative = new RegExp(`^//${CHAT_HOST.replaceAll('.', '\\.')}(?=/|$)`, 'i')
  if (protocolRelative.test(trimmed)) return trimmed.replace(protocolRelative, '')
  return trimmed
}

/** Copy an upstream response's headers, dropping framing/CORS and rebinding cookies. */
function downstreamHeaders(upstream: IncomingMessage): Record<string, string | string[]> {
  const headers: Record<string, string | string[]> = {}
  for (const [key, value] of Object.entries(upstream.headers)) {
    if (value === undefined) continue
    const lower = key.toLowerCase()
    if (HOP_BY_HOP.has(lower) || STRIPPED_RESPONSE_HEADERS.has(lower)) continue
    if (lower === 'set-cookie') {
      const list = Array.isArray(value) ? value : [value]
      headers['set-cookie'] = list.map(rebindSetCookie)
      continue
    }
    if (lower === 'location') {
      headers[key] = typeof value === 'string' ? rebaseLocation(value) : value
      continue
    }
    headers[key] = value
  }
  return headers
}

/**
 * Answer one proxied request.
 *
 * Text bodies that may contain upstream URLs are buffered and rewritten; every
 * other body (JSON, images, the chat SSE stream) is piped straight through so
 * replies still arrive token by token.
 *
 * @param req - incoming request.
 * @param res - outgoing response.
 */
export function handleProxy(req: IncomingMessage, res: ServerResponse): void {
  const requestPath = req.url ?? '/'
  const target = resolveTarget(requestPath)

  // A body can only be rewritten if it arrives uncompressed, so `identity` is
  // forced for every response this proxy may rewrite — i.e. everything EXCEPT
  // the API namespace. The SPA's JSON backend is the chatty, latency-sensitive
  // traffic (token streams, history pages) and must keep the browser's real
  // `accept-encoding`; document and asset responses are few and are rewritten.
  //
  // An earlier version used `sec-fetch-dest === 'document' || req.method ===
  // 'GET'`, which forced identity on EVERY GET (including API calls) while its
  // comment claimed only navigations were affected.
  const needsIdentity = !requestPath.startsWith(API_PREFIX)

  const upstream = httpsRequest(
    {
      host: target.host,
      path: target.path,
      method: req.method,
      headers: upstreamHeaders(req, target.host, needsIdentity),
    },
    (response) => {
      const headers = downstreamHeaders(response)

      // Rewrite ONLY when the body is text we can actually read. A compressed
      // body must never reach rewriteBody(): the string replace runs over gzip
      // bytes, the result is re-encoded as utf8, and the browser then tries to
      // gunzip bytes that are no longer gzip ("incorrect header check"). This is
      // reachable in practice — an API call that answers with a compressed HTML
      // error page has a rewritable content-type.
      //
      // Requests this proxy rewrites are forced to `identity` upstream, so in the
      // normal path the encoding is absent; the guard is what makes the normal
      // path provable rather than assumed.
      const contentEncoding = response.headers['content-encoding']
      const isCompressed = contentEncoding !== undefined && contentEncoding !== 'identity'

      if (!isCompressed && isRewritableType(response.headers['content-type'])) {
        const chunks: Buffer[] = []
        response.on('data', (chunk: Buffer) => chunks.push(chunk))
        response.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf8')
          const rewritten = rewriteBody(raw)
          // Only documents need the origin shim; CSS and JS bodies are rewritten
          // too but must not carry markup.
          const contentType = response.headers['content-type'] ?? ''
          const body = Buffer.from(
            contentType.includes('text/html') ? injectOriginShim(rewritten) : rewritten,
            'utf8',
          )
          // The length must match the rewritten bytes; the original one no longer
          // does. `content-encoding` is dropped for the same reason.
          delete headers['content-length']
          headers['content-length'] = String(body.length)
          delete headers['content-encoding']
          res.writeHead(response.statusCode ?? 502, headers)
          res.end(body)
        })
        response.on('error', () => {
          if (!res.headersSent) res.writeHead(502)
          res.end()
        })
        return
      }

      res.writeHead(response.statusCode ?? 502, headers)
      response.pipe(res)
    },
  )

  /**
   * True once the browser's end of this exchange is finished or gone.
   *
   * Set by the `close` handler below, which also destroys the upstream request.
   * The error handler consults it so the destruction it caused itself is not
   * reported as an upstream failure — otherwise every panel close, conversation
   * switch and DSH shutdown logs "socket hang up" warnings that look like real
   * errors.
   */
  let clientGone = false

  upstream.on('error', (error: Error) => {
    // Caused by our own teardown (see clientGone): expected, not a failure.
    if (clientGone) return
    console.warn('[dsh-chat-deepseek] upstream request failed:', error.message)
    // The client may have vanished for another reason; writing to a destroyed
    // response would throw.
    if (res.destroyed || res.writableEnded) return
    if (!res.headersSent) {
      res.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' })
    }
    res.end(`DeepSeek upstream error: ${error.message}`)
  })

  /**
   * Abort upstream when the browser goes away.
   *
   * Closing the panel, switching conversation mid-answer or reloading the frame
   * drops the loopback connection. Without this the upstream request keeps
   * streaming into a dead socket until the model finishes — a long completion can
   * hold a TLS connection, its buffers and an event listener for minutes.
   */
  res.on('close', () => {
    clientGone = true
    if (!upstream.destroyed) upstream.destroy()
  })

  /**
   * Idle timeout for the upstream socket.
   *
   * `server.requestTimeout` is 0 (a completion stream legitimately lives for
   * minutes), so a half-dead peer would otherwise hold the socket forever. This
   * is an IDLE timer, not a total-duration cap: it resets on every byte, so a
   * slow but progressing stream is never cut. Ten minutes is far beyond any real
   * gap between tokens.
   */
  upstream.setTimeout(UPSTREAM_IDLE_TIMEOUT_MS, () => {
    upstream.destroy(new Error(`upstream idle for ${UPSTREAM_IDLE_TIMEOUT_MS}ms`))
  })

  req.pipe(upstream)
}

/** True when the request comes from this machine (the session must not leak to the LAN). */
function isLoopbackRequest(req: IncomingMessage): boolean {
  const address = req.socket.remoteAddress
  return (
    address !== undefined &&
    (address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1')
  )
}

/**
 * Route prefix the SPA uses for one conversation: `/a/chat/s/<id>`.
 *
 * The SPA is a single-page app: switching conversations uses `history.pushState`,
 * so there is NO document request and the iframe's URL cannot be read from the
 * parent frame (cross-origin). The last-viewed conversation must therefore be
 * observed on the wire.
 */
const CHAT_ROUTE_PREFIX = '/a/chat/s/'

/**
 * API call the SPA makes when it opens a conversation, carrying the id as a
 * query parameter. This is the signal used to record "which chat is on screen".
 */
const HISTORY_MESSAGES_PATH = '/api/v0/chat/history_messages'

/**
 * Extract a conversation id from a request path, or undefined when the request
 * says nothing about which conversation is open.
 *
 * Two sources, in order of reliability:
 *  1. `GET /a/chat/s/<id>` — a full document navigation (reload, direct link).
 *  2. `GET /api/v0/chat/history_messages?chat_session_id=<id>` — the call the
 *     SPA makes every time a conversation is opened, which is the ONLY signal
 *     available for in-app navigation.
 *
 * @param requestPath - incoming pathname plus query string.
 * @returns the conversation id, or undefined.
 */
export function conversationIdOf(requestPath: string): string | undefined {
  const [pathname, search] = requestPath.split('?')

  if (pathname !== undefined && pathname.startsWith(CHAT_ROUTE_PREFIX)) {
    const id = pathname.slice(CHAT_ROUTE_PREFIX.length).split('/')[0]
    if (id !== undefined && id !== '') return id
  }

  if (pathname === HISTORY_MESSAGES_PATH && search !== undefined) {
    const id = new URLSearchParams(search).get('chat_session_id')
    if (id !== null && id !== '') return id
  }

  return undefined
}

/** Last conversation seen on the wire, persisted so it survives a restart. */
export interface ConversationTracker {
  /** Record a conversation id observed on the wire. */
  observe(id: string): void
  /** Last observed conversation id, or undefined when none has been seen. */
  current(): string | undefined
  /** Stop any pending flush. */
  dispose(): void
}

/**
 * Create a tracker that remembers the last-viewed conversation across restarts.
 *
 * Writes are debounced and best-effort: a failed write only costs the restore
 * convenience, never the session.
 *
 * @param file - absolute path of the JSON state file, or undefined to keep the
 *   value in memory only.
 * @returns the tracker.
 */
export function createConversationTracker(file: string | undefined): ConversationTracker {
  let last: string | undefined
  let timer: ReturnType<typeof setTimeout> | undefined

  if (file !== undefined) {
    try {
      const raw = readFileSync(file, 'utf8')
      const parsed: unknown = JSON.parse(raw)
      if (typeof parsed === 'object' && parsed !== null) {
        const value = (parsed as { conversationId?: unknown }).conversationId
        if (typeof value === 'string' && value !== '') last = value
      }
    } catch {
      // Missing or unreadable state simply means "nothing to restore".
    }
  }

  const flush = (): void => {
    timer = undefined
    if (file === undefined || last === undefined) return
    try {
      mkdirSync(dirname(file), { recursive: true })
      writeFileSync(file, JSON.stringify({ conversationId: last }), 'utf8')
    } catch (error) {
      console.warn('[dsh-chat-deepseek] could not persist last conversation:', error)
    }
  }

  return {
    observe(id: string): void {
      if (id === last) return
      last = id
      // Debounce: the SPA repeats this call while a conversation loads.
      if (timer !== undefined) clearTimeout(timer)
      timer = setTimeout(flush, 400)
    },
    current(): string | undefined {
      return last
    },
    dispose(): void {
      if (timer !== undefined) {
        clearTimeout(timer)
        flush()
      }
    },
  }
}

/** A running proxy and the URL the iframe should load. */
export interface ProxyHandle {
  /** Base URL the GUI's iframe points at, e.g. `http://127.0.0.1:18190/`. */
  url: string
  /** Actual bound port (differs from the requested one when it was taken). */
  port: number
  /**
   * The conversation the proxy last observed on the wire, or undefined when none
   * has been seen.
   *
   * The parent frame cannot read a cross-origin iframe's URL, so the wire is the
   * only place "which chat is on screen" is observable — this is what lets the
   * panel reopen the same chat after a restart.
   */
  lastConversation(): string | undefined
  /** Stop the server and release the port. */
  dispose(): Promise<void>
}

/**
 * Start the proxy on a loopback port.
 *
 * Falls back to an ephemeral port when the preferred one is busy, so a stale
 * instance or an unrelated program can never stop the plugin from mounting.
 *
 * @param preferredPort - port to try first.
 * @returns the running proxy handle.
 */
export async function startProxy(
  preferredPort: number = DEFAULT_PORT,
  stateFile?: string,
): Promise<ProxyHandle> {
  const tracker = createConversationTracker(stateFile)

  const server: Server = createServer((req, res) => {
    if (!isLoopbackRequest(req)) {
      res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' })
      res.end('loopback only')
      return
    }
    // Record which conversation the SPA is showing. The parent frame cannot read
    // a cross-origin iframe's URL, so the wire is the only place this is visible.
    const conversationId = conversationIdOf(req.url ?? '/')
    if (conversationId !== undefined) tracker.observe(conversationId)
    handleProxy(req, res)
  })

  // Long-lived chat streams must not be cut by the default request timeout.
  server.requestTimeout = 0
  server.headersTimeout = 60_000

  const port = await new Promise<number>((resolve, reject) => {
    /**
     * Try to bind one port, retrying once on an ephemeral port when the preferred
     * one is taken.
     *
     * BOTH outcome handlers must be re-registered on every attempt. An earlier
     * version removed the `listening` handler on EADDRINUSE and never put it
     * back, so the fallback bind succeeded but nothing ever settled this promise:
     * the status route then never answered and the panel sat on
     * "正在连接 DeepSeek…" forever. That is why the retry is a recursive call
     * rather than an in-place `server.listen(0)`.
     *
     * @param candidate - port to bind (0 = let the OS choose).
     * @param allowRetry - whether an EADDRINUSE may fall back to an ephemeral port.
     */
    const listen = (candidate: number, allowRetry: boolean): void => {
      function onListening(): void {
        server.off('error', onError)
        const address = server.address()
        resolve(typeof address === 'object' && address !== null ? address.port : candidate)
      }
      function onError(error: NodeJS.ErrnoException): void {
        server.off('listening', onListening)
        if (allowRetry && error.code === 'EADDRINUSE' && candidate !== 0) {
          listen(0, false)
          return
        }
        reject(error)
      }
      server.once('error', onError)
      server.once('listening', onListening)
      server.listen(candidate, '127.0.0.1')
    }

    listen(preferredPort, true)
  })

  return {
    url: `http://127.0.0.1:${port}/`,
    port,
    lastConversation: () => tracker.current(),
    dispose: () =>
      new Promise<void>((resolve) => {
        tracker.dispose()
        server.close(() => resolve())
        // Drop idle keep-alive sockets so close() can finish promptly.
        server.closeAllConnections?.()
      }),
  }
}

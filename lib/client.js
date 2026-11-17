window.__ModuleLoader__.load({
	id: "dsh-chat-deepseek",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client/index.ts
var index_exports = {};
__export(index_exports, {
  apply: () => apply,
  inject: () => inject
});
module.exports = __toCommonJS(index_exports);

// src/client/diagnose.ts
var DIAGNOSIS_ID = "dsh-chat-deepseek-diagnosis";
function showDiagnosis(diagnosis) {
  let host = document.getElementById(DIAGNOSIS_ID);
  if (host === null) {
    host = document.createElement("div");
    host.id = DIAGNOSIS_ID;
    host.style.cssText = [
      "position:fixed",
      "right:16px",
      "bottom:16px",
      "z-index:2147483647",
      "max-width:520px",
      "max-height:60vh",
      "overflow:auto",
      "padding:12px 14px",
      "border-radius:10px",
      "border:1px solid #c0392b",
      "background:#fff",
      "color:#2c2c2a",
      "font:12px/1.6 ui-monospace,SFMono-Regular,Menlo,monospace",
      "box-shadow:0 8px 28px rgba(0,0,0,.22)",
      "white-space:pre-wrap"
    ].join(";");
    document.body.appendChild(host);
  }
  const head = document.createElement("div");
  head.textContent = "\u26A0 " + diagnosis.headline;
  head.style.cssText = "font-weight:700;color:#c0392b;margin-bottom:8px";
  const body = document.createElement("div");
  body.textContent = diagnosis.lines.map(([k, v]) => `${k}: ${v}`).join("\n");
  const close = document.createElement("button");
  close.type = "button";
  close.textContent = "\u5173\u95ED";
  close.style.cssText = "margin-top:10px;padding:3px 10px;border:1px solid #c0392b;border-radius:6px;background:transparent;color:#c0392b;cursor:pointer;font:inherit";
  close.addEventListener("click", () => {
    host?.remove();
  });
  host.replaceChildren(head, body, close);
}
function clearDiagnosis() {
  document.getElementById(DIAGNOSIS_ID)?.remove();
}
function diagnoseMountFailure(error) {
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  const lines = [["\u9519\u8BEF", message]];
  if (error instanceof Error && error.stack !== void 0) {
    const frame = error.stack.split("\n").find((l) => l.includes("dsh-chat-deepseek"));
    if (frame !== void 0) lines.push(["\u4F4D\u7F6E", frame.trim()]);
  }
  lines.push(["\u6837\u5F0F\u5DF2\u6CE8\u5165", String(document.getElementById("dsh-chat-deepseek-styles") !== null)]);
  lines.push(["\u8986\u76D6\u5C42\u5B58\u5728", String(document.querySelector("[data-dsh-chat-deepseek-view]") !== null)]);
  lines.push(["\u4E3B\u69FD\u951A\u70B9", String(document.querySelector("[data-dsh-chat-deepseek-anchor]") !== null)]);
  lines.push(["\u9875\u9762\u5730\u5740", location.href.slice(0, 80)]);
  return { headline: "DeepSeek \u9762\u677F\u672A\u80FD\u6302\u8F7D", lines };
}

// src/client/icon.ts
var import_react = require("react");
function DeepSeekIcon({ size = 16 }) {
  return (0, import_react.createElement)(
    "svg",
    {
      viewBox: "0 0 24 24",
      width: size,
      height: size,
      fill: "none",
      stroke: "currentColor",
      strokeWidth: 1.75,
      strokeLinecap: "round",
      strokeLinejoin: "round",
      "aria-hidden": "true",
      style: { display: "block" }
    },
    (0, import_react.createElement)("path", {
      d: "M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4Z"
    })
  );
}

// src/client/main-panel.ts
var import_react2 = require("react");

// src/client/anchor.ts
var anchor;
var listeners = /* @__PURE__ */ new Set();
function setPanelAnchor(element) {
  if (anchor === element) return;
  anchor = element;
  for (const listener of listeners) {
    try {
      listener();
    } catch (error) {
      console.warn("[dsh-chat-deepseek] anchor listener failed:", error);
    }
  }
}
function panelAnchor() {
  return anchor;
}
function onPanelAnchorChange(listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// src/client/main-panel.ts
function boxOf(host) {
  if (host === null) return void 0;
  const marked = host.closest("[data-global-panel]");
  if (marked !== null) return marked;
  return host.parentElement ?? void 0;
}
function DeepSeekPanel() {
  const host = (0, import_react2.useRef)(null);
  (0, import_react2.useEffect)(() => {
    setPanelAnchor(boxOf(host.current));
    return () => setPanelAnchor(void 0);
  }, []);
  return (0, import_react2.createElement)("div", {
    ref: host,
    "data-dsh-chat-deepseek-anchor": "",
    "aria-hidden": "true",
    style: { width: "100%", height: "100%", pointerEvents: "none" }
  });
}

// src/client/panel-view.ts
function createPanel(onRefresh, onOpenExternal) {
  const container = document.createElement("div");
  container.dataset.dshChatDeepseekView = "";
  container.dataset.dshPlugin = "chat-deepseek";
  const bar = document.createElement("div");
  bar.className = "dsh-chat-deepseek-bar";
  const title = document.createElement("span");
  title.className = "dsh-chat-deepseek-title";
  title.textContent = "DeepSeek Chat";
  const spacer = document.createElement("span");
  spacer.className = "dsh-chat-deepseek-spacer";
  const refresh = document.createElement("button");
  refresh.type = "button";
  refresh.className = "dsh-chat-deepseek-btn";
  refresh.textContent = "\u5237\u65B0";
  refresh.title = "\u91CD\u65B0\u52A0\u8F7D\u5BF9\u8BDD\u9875\u9762";
  refresh.addEventListener("click", onRefresh);
  const external = document.createElement("button");
  external.type = "button";
  external.className = "dsh-chat-deepseek-btn";
  external.textContent = "\u5728\u6D4F\u89C8\u5668\u6253\u5F00";
  external.title = "\u5728\u7CFB\u7EDF\u6D4F\u89C8\u5668\u4E2D\u6253\u5F00 chat.deepseek.com";
  external.addEventListener("click", onOpenExternal);
  bar.append(title, spacer, refresh, external);
  container.append(bar);
  let frame;
  let state;
  const clearState = () => {
    state?.remove();
    state = void 0;
  };
  const showState = (text, isError) => {
    clearState();
    state = document.createElement("div");
    state.className = "dsh-chat-deepseek-state";
    const line = document.createElement("div");
    if (isError) line.className = "dsh-chat-deepseek-state-error";
    line.textContent = text;
    state.append(line);
    container.append(state);
  };
  const showFrame = (url) => {
    clearState();
    frame?.remove();
    frame = document.createElement("iframe");
    frame.className = "dsh-chat-deepseek-frame";
    frame.title = "DeepSeek Chat";
    frame.setAttribute(
      "sandbox",
      "allow-scripts allow-same-origin allow-forms allow-popups allow-downloads allow-modals"
    );
    frame.setAttribute("allow", "clipboard-write; microphone");
    frame.src = url;
    container.append(frame);
  };
  return {
    container,
    showFrame,
    showState,
    hasFrame: () => frame !== void 0
  };
}

// src/client/positioning.ts
var CENTER_COLUMN_SELECTOR = '[data-pane="conversation"], [class*="centerCol"]';
var SIDEBAR_SELECTOR = '[data-pane="sidebar"], [class*="sidebarCol"]';
function applyRect(container, rect) {
  container.style.left = `${Math.round(rect.left)}px`;
  container.style.top = `${Math.round(rect.top)}px`;
  container.style.width = `${Math.round(rect.width)}px`;
  container.style.height = `${Math.round(rect.height)}px`;
}
function usableBox(element) {
  if (element === void 0 || !element.isConnected) return void 0;
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0 ? rect : void 0;
}
function positionOverSlot(container) {
  const anchor2 = panelAnchor();
  const slot = usableBox(anchor2) ?? usableBox(anchor2?.closest(CENTER_COLUMN_SELECTOR) ?? void 0);
  if (slot !== void 0) {
    applyRect(container, slot);
    return true;
  }
  const sidebar = document.querySelector(SIDEBAR_SELECTOR);
  const left = sidebar?.getBoundingClientRect().right ?? 0;
  applyRect(container, {
    left,
    top: 0,
    width: Math.max(0, window.innerWidth - left),
    height: window.innerHeight
  });
  return false;
}
function watchSlotBox(container) {
  let observed;
  const resize = new ResizeObserver(() => {
    positionOverSlot(container);
  });
  const follow = () => {
    const anchor2 = panelAnchor();
    if (anchor2 !== observed) {
      if (observed !== void 0) resize.unobserve(observed);
      observed = anchor2;
      if (anchor2 !== void 0) resize.observe(anchor2);
    }
    positionOverSlot(container);
  };
  const offAnchor = onPanelAnchorChange(follow);
  const onResize = () => {
    positionOverSlot(container);
  };
  window.addEventListener("resize", onResize);
  follow();
  return {
    dispose() {
      offAnchor();
      window.removeEventListener("resize", onResize);
      resize.disconnect();
      observed = void 0;
    }
  };
}

// src/client/persist.ts
var ACTIVE_PANEL_KEY = "dsh-chat-deepseek:active-panel";
function getActivePanel() {
  try {
    return localStorage.getItem(ACTIVE_PANEL_KEY) === "chat" ? "chat" : "";
  } catch {
    return "";
  }
}
function setActivePanel(panel) {
  try {
    if (panel === "") localStorage.removeItem(ACTIVE_PANEL_KEY);
    else localStorage.setItem(ACTIVE_PANEL_KEY, panel);
  } catch {
  }
}

// src/client/styles.ts
var STYLE_ID = "dsh-chat-deepseek-styles";
var STYLES = `
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
   which sets the attribute from layout.panelInfo \u2014 the same store the sidebar
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
`;

// src/client/mount.ts
var PANEL_ID = "chat-deepseek";
var ACTIVATE_EVENT = "dsh-panel-activate";
var OTHER_ACTIVE_ATTRS = ["data-dsh-wiki-active", "data-dsh-ssh-active", "data-dsh-taskboard-active"];
var STATUS_PATH = "/api/dsh-chat-deepseek/status";
var CHAT_ROUTE_PREFIX = "/a/chat/s/";
function ensureStyles() {
  if (document.getElementById(STYLE_ID) !== null) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = STYLES;
  document.head.appendChild(style);
}
async function fetchStatus() {
  const res = await fetch(STATUS_PATH, { headers: { accept: "application/json" } });
  return await res.json();
}
function mountRuntime(layout) {
  ensureStyles();
  let view;
  let watcher;
  let proxyUrl;
  let statusRead = false;
  let restoreAttempted = false;
  let open = false;
  const openExternal = () => {
    window.open("https://chat.deepseek.com/", "_blank", "noopener,noreferrer");
  };
  const refresh = () => {
    if (view === void 0 || proxyUrl === void 0) return;
    view.showFrame(proxyUrl);
  };
  const resolveProxy = async () => {
    if (statusRead) return;
    statusRead = true;
    try {
      const status = await fetchStatus();
      if (!status.ready || status.url === void 0) {
        view?.showState(`DeepSeek \u4EE3\u7406\u672A\u5C31\u7EEA\uFF1A${status.error ?? "\u672A\u77E5\u539F\u56E0"}`, true);
        return;
      }
      proxyUrl = status.url;
      if (view === void 0 || view.hasFrame()) return;
      positionOverSlot(view.container);
      const last = status.lastConversation;
      const initial = typeof last === "string" && last !== "" ? new URL(CHAT_ROUTE_PREFIX + last, status.url).toString() : status.url;
      view.showFrame(initial);
    } catch (error) {
      view?.showState(
        `\u65E0\u6CD5\u8BFB\u53D6\u4EE3\u7406\u72B6\u6001\uFF08${error instanceof Error ? error.message : String(error)}\uFF09\u3002\u8BF7\u786E\u8BA4\u63D2\u4EF6\u5DF2\u5728 Host \u4FA7\u542F\u7528\u540E\u91CD\u8BD5\u3002`,
        true
      );
    }
  };
  const ensure = () => {
    if (view !== void 0 && view.container.isConnected) return view;
    if (view !== void 0) {
      statusRead = false;
      proxyUrl = void 0;
      watcher?.dispose();
      watcher = void 0;
    }
    view = createPanel(refresh, openExternal);
    document.body.appendChild(view.container);
    view.showState("\u6B63\u5728\u8FDE\u63A5 DeepSeek\u2026", false);
    watcher = watchSlotBox(view.container);
    void resolveProxy();
    return view;
  };
  const evictSiblings = () => {
    for (const attr of OTHER_ACTIVE_ATTRS) document.documentElement.removeAttribute(attr);
    document.dispatchEvent(new CustomEvent(ACTIVATE_EVENT, { detail: PANEL_ID }));
  };
  const applySelection = () => {
    let activePanelId = null;
    try {
      activePanelId = layout.panelInfo.getSnapshot().activePanelId;
    } catch {
      return;
    }
    const next = activePanelId === PANEL_ID;
    if (restoreAttempted) setActivePanel(next ? "chat" : "");
    if (next === open) {
      if (next) positionOverSlot(ensure().container);
      return;
    }
    open = next;
    const panel = ensure();
    if (!next) {
      delete panel.container.dataset.open;
      return;
    }
    try {
      evictSiblings();
      positionOverSlot(panel.container);
      panel.container.dataset.open = "";
      void resolveProxy();
    } catch (error) {
      console.error("[dsh-chat-deepseek] failed to open the panel:", error);
      try {
        showDiagnosis(diagnoseMountFailure(error));
      } catch {
      }
    }
  };
  const unsubscribe = layout.panelInfo.subscribe(applySelection);
  ensure();
  applySelection();
  return {
    restoreSelection() {
      if (restoreAttempted) return;
      restoreAttempted = true;
      if (getActivePanel() !== "chat") return;
      try {
        layout.selectPanel(PANEL_ID);
      } catch (error) {
        console.warn("[dsh-chat-deepseek] could not restore the panel selection:", error);
      }
    },
    dispose() {
      unsubscribe();
      watcher?.dispose();
      watcher = void 0;
      view?.container.remove();
      view = void 0;
    }
  };
}

// src/client/index.ts
var inject = ["slots", "layout"];
var PANEL_ORDER = -10;
function apply(ctx) {
  let runtime;
  try {
    runtime = mountRuntime(ctx.layout);
    clearDiagnosis();
  } catch (error) {
    console.error("[dsh-chat-deepseek] panel runtime failed:", error);
    try {
      showDiagnosis(diagnoseMountFailure(error));
    } catch {
    }
  }
  ctx.effect(
    () => ctx.slots.inject("main", () => {
      const dispose = ctx.slots.register({ name: "main", key: PANEL_ID }, DeepSeekPanel);
      runtime?.restoreSelection();
      return dispose;
    }),
    "dsh-chat-deepseek: main panel"
  );
  ctx.effect(
    () => ctx.slots.inject(
      "sidebar.panellist",
      () => ctx.slots.register(
        {
          name: "sidebar.panellist",
          id: PANEL_ID,
          order: PANEL_ORDER,
          label: () => "\u804A\u5929"
        },
        DeepSeekIcon
      )
    ),
    "dsh-chat-deepseek: sidebar row"
  );
  ctx.effect(
    () => () => {
      runtime?.dispose();
      runtime = void 0;
    },
    "dsh-chat-deepseek: runtime"
  );
}

		return module.exports;
	}
});

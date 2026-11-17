/**
 * Ambient declarations for the packages the DSH Host/GUI provides at runtime.
 *
 * The plugin is installed as a `file:` link and this project has no
 * `node_modules` of its own, so TypeScript cannot resolve these specifiers. Only
 * the members this plugin actually touches are declared — enough for `tsc
 * --noEmit` to type-check our own code without pretending to re-model the Host.
 *
 * These are type-only: every one of these imports is erased by esbuild, so
 * nothing here reaches the shipped bundle.
 */

declare module '@deepseek-ai/cordis' {
  /** A live config cell that can be read without remounting the plugin. */
  export interface Volatile<T> {
    get(): T
  }

  /** Plugin context; only the members used by this plugin are modelled. */
  export interface Context {
    effect(execute: () => (() => void) | void, label?: string): void
    inject(
      deps: string[],
      execute: (scope: Context & Record<string, unknown>) => void,
    ): void
    webServer: import('@deepseek-ai/dsh-host-webserver').WebServer
  }
}

declare module '@deepseek-ai/dsh-host-webserver' {
  import type { IncomingMessage, ServerResponse } from 'node:http'

  /** One route the Host's web server should answer. */
  export interface WebRoute {
    kind: 'exact' | 'prefix'
    path: string
    handler(req: IncomingMessage, res: ServerResponse): void
  }

  /** The Host's web server service. */
  export interface WebServer {
    register(route: WebRoute): () => void
  }
}

declare module '@deepseek-ai/schemastery' {
  /** The subset of a schemastery schema used to describe plugin config. */
  export interface Schema<T> {
    volatile(): Schema<T>
  }

  /** Field builder for numbers. */
  export interface NumberSchema extends Schema<number> {
    min(value: number): NumberSchema
    max(value: number): NumberSchema
    required(value: boolean): NumberSchema
  }

  /** Field builder for booleans. */
  export interface BooleanSchema extends Schema<boolean> {
    required(value: boolean): BooleanSchema
  }

  const z: {
    object(shape: Record<string, unknown>): unknown
    number(): NumberSchema
    boolean(): BooleanSchema
    string(): { required(value: boolean): unknown }
  }

  export default z
}

declare module '@deepseek-ai/dsh-client-runtime/client' {
  /**
   * The observable the layout store exposes to plugins.
   *
   * Structurally identical to the Host's `HostObservable`: a snapshot getter plus
   * a change subscription. Declared here so `panelInfo` can be used without
   * importing any `@deepseek-ai/*` type package (the GUI resolves those at
   * runtime, not at build time).
   */
  export interface ClientObservable<T> {
    getSnapshot(): T
    subscribe(listener: () => void): () => void
  }

  /** Root-scoped navigation state: which global panel owns the centre column. */
  export interface ClientPanelInfo {
    /** Selected global panel id, or null while the Conversation is shown. */
    readonly activePanelId: string | null
  }

  /**
   * The layout service (`ctx.layout`).
   *
   * `selectPanel` is the ONLY supported way to change the selection: it validates
   * the id against the live `main` slot registry and throws when the id is not
   * registered, which is why callers guard it.
   */
  export interface ClientLayout {
    readonly panelInfo: ClientObservable<ClientPanelInfo>
    selectPanel(panelId: string | null): void
  }

  /**
   * One slot registration.
   *
   * The framework distinguishes slots by kind, and the kind decides which key
   * field is required:
   *
   *   - a LAYOUT SLOT (e.g. `main`) takes `key` — it is the identity the owner
   *     dispatches (`renderSlot('main', {}, { entryKey })`);
   *   - a LIST SLOT (e.g. `sidebar.panellist`) takes `id` — the cell key, which
   *     also doubles as the main-panel id the row selects;
   *   - a SINGLE slot takes neither.
   *
   * `label` is projected by owners that render text (sidebar rows); a thunk is
   * re-read on every projection.
   */
  export interface SlotRegistration {
    /** Slot name, e.g. `main` or `sidebar.panellist`. */
    name: string
    /** Keyed-slot identity. */
    key?: string
    /** List-slot cell key. */
    id?: string
    /** Ascending position among the slot's entries (default 0). */
    order?: number
    /** Row/list text where the owner projects one. */
    label?: string | (() => string)
    /** Locale namespace for the label, when one is used. */
    locale?: string
  }

  /** The Host's slot registry (`ctx.slots`). */
  export interface ClientSlots {
    /**
     * Register for as long as `slotName` is declared.
     *
     * The declaration comes from whoever owns the parent slot (`root` owns
     * `main`, `sidebar` owns `sidebar.panellist`), so this is how a plugin
     * follows the shell's own lifetime instead of guessing at DOM readiness.
     *
     * @returns disposer removing the registration.
     */
    inject(slotName: string, register: () => () => void): () => void
    /**
     * Add one entry to a slot.
     *
     * The component is rendered with the owner's props plus the framework's
     * standard props. Typed as `unknown` on input: a React component is opaque
     * here, and this project has no React type dependency to name it with.
     *
     * @returns disposer removing the entry.
     */
    register(spec: SlotRegistration, component: unknown): () => void
  }

  /** Root context handed to a client plugin's `apply`. */
  export interface ClientContext {
    effect(execute: () => (() => void) | void, label?: string): void
    inject(
      deps: string[],
      execute: (scope: ClientContext & Record<string, unknown>) => void,
    ): void
    /** Slot registry. Declared via the plugin's `inject` export. */
    slots: ClientSlots
    /** Layout service: sidebar geometry, column widths, panel selection. */
    layout: ClientLayout
  }
}

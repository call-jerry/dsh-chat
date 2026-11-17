/**
 * Minimal ambient declaration for the React instance the GUI provides.
 *
 * WHY NOT `@types/react`
 * ----------------------
 * This project has no `node_modules` of its own (see scripts/lib/paths.mjs) and
 * the type checker is borrowed from elsewhere on the machine. Pointing at a
 * machine-specific `@types/react` would make `npm run typecheck` break on any
 * other checkout, so the handful of hooks this plugin actually calls are
 * declared structurally — the same convention `host-modules.d.ts` uses for the
 * `@deepseek-ai/*` packages.
 *
 * The bundle never imports this: it is type-only, erased by esbuild. At runtime
 * `require('react')` resolves against the GUI's frozen module table, so our
 * components use the shell's own React instance (a second copy would break hooks
 * and context).
 *
 * The plugin deliberately builds elements with `createElement` instead of JSX: a
 * JSX transform would need the full `JSX.IntrinsicElements` surface, which is far
 * more type declaration for two small components than it is worth.
 */

declare module 'react' {
  /** A ref whose `.current` the component may write. */
  export interface MutableRefObject<T> {
    current: T
  }

  /** `useRef` with an explicit initial value (the only form used here). */
  export function useRef<T>(initial: T): MutableRefObject<T>

  /**
   * Run an effect after commit.
   *
   * @param effect - may return a cleanup function, which React runs on unmount
   *   or before the next run.
   */
  export function useEffect(effect: () => void | (() => void), deps?: readonly unknown[]): void

  /** Element factory; the return value is opaque to this project. */
  export function createElement(
    type: string,
    props?: Record<string, unknown> | null,
    ...children: unknown[]
  ): unknown
}

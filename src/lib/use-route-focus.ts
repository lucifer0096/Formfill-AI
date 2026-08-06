"use client";

import { useEffect, useRef, type RefObject } from "react";

/**
 * Focuses the returned ref's element once, on mount — so navigating to a new
 * page moves a screen reader straight to its heading instead of leaving
 * focus wherever the previous page left it (or nowhere at all, silently).
 * Pair with `tabIndex={-1}` on the element: it's a one-time programmatic
 * focus target, not a stop in the page's own Tab order.
 */
export function useRouteFocus<T extends HTMLElement>(): RefObject<T | null> {
  const ref = useRef<T>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  return ref;
}

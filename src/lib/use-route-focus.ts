import { useEffect, useRef } from "react";

/**
 * ACCESSIBILITY.md §3: "Route changes move focus to the new <h1> and
 * announce it." Without this, a screen-reader user gets no signal a
 * navigation happened at all — they'd have to explore the page to find out.
 * Attach the returned ref to the page's <h1 tabIndex={-1}>.
 */
export function useRouteFocus<T extends HTMLElement>() {
  const ref = useRef<T>(null);

  useEffect(() => {
    ref.current?.focus();
  }, []);

  return ref;
}

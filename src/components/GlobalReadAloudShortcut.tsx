"use client";

import { useGlobalReadAloudShortcut } from "@/lib/speech/use-global-read-aloud";

/** Mounts the one Ctrl+Alt+S listener for the whole app. Renders nothing. */
export default function GlobalReadAloudShortcut() {
  useGlobalReadAloudShortcut();
  return null;
}

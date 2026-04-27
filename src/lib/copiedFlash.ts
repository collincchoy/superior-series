const DEFAULT_MS = 1800;

/**
 * Drives a short "Copied" UI state: call `flash()` after a successful copy, and
 * pass `onDestroy` from the owning Svelte component so timers are cleared.
 */
export function createCopiedFlash(
  setCopied: (value: boolean) => void,
  onTeardown: (fn: () => void) => void,
  options?: { durationMs?: number },
) {
  const duration = options?.durationMs ?? DEFAULT_MS;
  let timer: ReturnType<typeof setTimeout> | undefined;

  onTeardown(() => {
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
  });

  return {
    flash() {
      setCopied(true);
      if (timer !== undefined) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = undefined;
        setCopied(false);
      }, duration);
    },
  };
}

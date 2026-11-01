import { UpstreamTimeoutError } from "./errors.js";

/** Rejects with UpstreamTimeoutError when `signal` aborts, even if `work` ignores the signal. */
export function withSignal<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new UpstreamTimeoutError());
    if (signal.aborted) return onAbort();
    signal.addEventListener("abort", onAbort, { once: true });
    work.then(
      (v) => {
        signal.removeEventListener("abort", onAbort);
        resolve(v);
      },
      (e) => {
        signal.removeEventListener("abort", onAbort);
        reject(signal.aborted ? new UpstreamTimeoutError() : e);
      },
    );
  });
}

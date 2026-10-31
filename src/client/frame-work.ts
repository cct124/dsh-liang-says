/** Yield between bounded batches so preparation/reclamation cannot monopolize an animation frame. */
export function nextTask(signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const cancel = () => { clearTimeout(timer); reject(signal!.reason); };
    const timer = setTimeout(() => { signal?.removeEventListener('abort', cancel); resolve(); }, 0);
    if (signal?.aborted) cancel();
    else signal?.addEventListener('abort', cancel, { once: true });
  });
}

export async function runInSlices(work: Generator<void>, signal?: AbortSignal, budgetMs = 3): Promise<void> {
  try {
    await nextTask(signal);
    for (;;) {
      const start = performance.now();
      do {
        signal?.throwIfAborted();
        if (work.next().done) return;
      } while (performance.now() - start < budgetMs);
      await nextTask(signal);
    }
  } finally { work.return(undefined); }
}

/** Use the media clock so decoder/output startup does not consume the 300 ms lead. */
export function playEntranceSound(audio: HTMLAudioElement, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(signal.reason); return; }
    audio.pause();
    audio.currentTime = 0;
    audio.volume = .25;
    const stop = () => { audio.pause(); audio.currentTime = 0; };
    signal.addEventListener('abort', stop, { once: true });

    let settled = false;
    let poll: ReturnType<typeof setTimeout> | undefined;
    let deadline: ReturnType<typeof setTimeout> | undefined;
    const cleanup = () => {
      clearTimeout(poll); clearTimeout(deadline);
      signal.removeEventListener('abort', cancel);
    };
    const finish = (silent = false) => {
      if (settled) return;
      settled = true; cleanup();
      if (silent) stop();
      resolve();
    };
    const cancel = () => {
      if (settled) return;
      settled = true; cleanup(); reject(signal.reason);
    };
    const check = () => {
      if (settled) return;
      if (audio.error) finish(true);
      else if (audio.currentTime >= .3) finish();
      else poll = setTimeout(check, 16);
    };
    signal.addEventListener('abort', cancel, { once: true });
    // A denied or stalled audio stream must never leave the visual transition pending.
    deadline = setTimeout(() => finish(true), 1500);
    try { void audio.play().catch(() => finish(true)); }
    catch { finish(true); }
    check();
  });
}

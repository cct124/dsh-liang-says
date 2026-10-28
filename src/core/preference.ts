const KEY = 'dsh-liang-says.enabled';
type PreferenceStorage = Pick<Storage, 'getItem' | 'setItem'>;

/** One browser-wide preference, shared by the composer and development preview. */
export class LiangPreference {
  private enabled = true;
  private readonly listeners = new Set<() => void>();
  private readonly storage: PreferenceStorage | undefined;
  constructor(storage?: PreferenceStorage) {
    this.storage = storage;
    try { this.enabled = storage?.getItem(KEY) !== 'false'; } catch { /* Storage may be unavailable. */ }
  }
  getSnapshot = () => this.enabled;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };
  setEnabled = (enabled: boolean) => {
    try { this.storage?.setItem(KEY, String(enabled)); } catch { /* Keep the switch usable in memory. */ }
    this.accept(enabled);
  };
  receiveStorage(key: string | null, value: string | null) {
    if (key === KEY || key === null) this.accept(value !== 'false');
  }
  private accept(enabled: boolean) {
    if (enabled === this.enabled) return;
    this.enabled = enabled;
    for (const listener of this.listeners) listener();
  }
}

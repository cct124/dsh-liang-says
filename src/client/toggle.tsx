import * as React from 'react';
import type { LiangPreference } from '../core/preference.ts';
import toggleCss from './toggle.css';

export function LiangToggle({ preference, label = '梁选', hint = '在所有模式的任务运行期间展示梁选文案' }: {
  preference: LiangPreference; label?: string; hint?: string;
}) {
  const enabled = React.useSyncExternalStore(preference.subscribe, preference.getSnapshot);
  return <><style>{toggleCss}</style><button type="button" role="switch" aria-checked={enabled}
    aria-label={label} title={hint} className="lx-toggle" onClick={() => preference.setEnabled(!enabled)}>
    <span className="lx-switch-track" aria-hidden="true"><span /></span><span>{label}</span>
  </button></>;
}

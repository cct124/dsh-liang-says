# 梁选文案弹窗音效

8 组短音效（9 个文件，含 `06` 的完整版），外加 `wind/` 下 10 条长风声源/预裁版，全部来自 Freesound 的 **CC0 1.0** 音频，可商用、可修改、无需署名。已做统一裁剪、淡出与响度处理，适合网页/桌面端的弹窗提示。

目录里还有 [`manifest.json`](manifest.json)，前端可直接读取其中的文件名、时长、推荐音量和来源信息。想快速试听，直接用浏览器打开 [`audition.html`](audition.html)。

> 如果只选一条用于“梁选”的字符飘入，先用 [`wind/wind-ready-01-slow-rise.mp3`](wind/wind-ready-01-slow-rise.mp3)。更长的风声源和裁剪参考在 [`wind/`](wind/)。

> `wind-long-01` 的作者 martian 在 Freesound 描述里请求网页使用时署名 `www.fork-media.com`；虽然 CC0 不强制，建议保留这句 credit。详见 [`wind/README.md`](wind/README.md)。

## 文件一览

| 文件 | 听感 | 时长 | 推荐音量 | 适合 |
|---|---|---:|---:|---|
| [`01-ding-bell.mp3`](01-ding-bell.mp3) | 清脆铃声，“叮~” | 0.66s | 0.45 | 默认弹窗、轻提示 |
| [`02-message-tone.mp3`](02-message-tone.mp3) | 经典短信提示音，“叮咚” | 1.18s | 0.40 | 日常、轻松文案 |
| [`03-ui-pop.mp3`](03-ui-pop.mp3) | 轻气泡，“啵” | 0.36s | 0.35 | 快速出现、克制风格 |
| [`04-deep-dun.mp3`](04-deep-dun.mp3) | 深鼓单响，“噔” | 0.72s | 0.50 | 重要文案、严肃语气 |
| [`05-deep-dun-dun.mp3`](05-deep-dun-dun.mp3) | 深鼓双响，“噔噔~” | 0.95s | 0.50 | 强调、转折、压轴 |
| [`06-cinematic-riser.mp3`](06-cinematic-riser.mp3) | 电影感上升音，“eng~~” | 2.12s | 0.42 | 长文案揭示、渐入 |
| [`06-cinematic-riser-full.mp3`](06-cinematic-riser-full.mp3) | 06 的完整未裁剪版 | 3.00s | 0.42 | 自行选 in/out、保留头尾 |
| [`07-deep-swell.mp3`](07-deep-swell.mp3) | 深低频涌起，“eng——” | 4.50s | 0.45 | 深邃、世界观、宏大叙事 |
| [`08-confirm-ping.mp3`](08-confirm-ping.mp3) | 上扬确认音，“叮~” | 1.36s | 0.40 | 选中、收藏、确认 |

> **关于 06 的长度**：它的原始公开音源只有 **3.00s**（[Freesound 859482](https://freesound.org/people/BeaconStudio/sounds/859482/)，作者描述为 “a short and subtle FX riser”），**没有更长版本**。`06-cinematic-riser.mp3` 是裁掉头尾后的 2.12s 版；`06-cinematic-riser-full.mp3` 保留了完整 3.00s，方便你自己选 in/out。需要更长只能换同类风声（见下面 `wind/`）。

文件名的 `01—08` 只是排序，不表示播放顺序。

## 长风声源（更贴近梁选动效）

`06-cinematic-riser.mp3` 的质感更接近“风”，但只有 2.12s。`wind/` 子目录里另外放了 **6 条 8—36s 长音源 + 4 条预裁版**，专门给字符/字符段飘入使用：

- 试听与推荐裁剪点：[`wind/audition.html`](wind/audition.html)
- 清单、裁剪建议、来源：[`wind/README.md`](wind/README.md)
- 机器可读配置：[`wind/manifest.json`](wind/manifest.json)

先听 `wind-ready-01-slow-rise`（慢速气流上升），它最接近“字符飘入”的感觉；需要强调时再用 `wind-ready-02-gust`。

## 建议映射

- **梁选默认**：`wind/wind-ready-01-slow-rise.mp3`，风声铺底，贴合字符飘入。
- **普通通知**：`01-ding-bell.mp3`，最像“短信提示”，不打扰。
- **克制/极简**：`03-ui-pop.mp3`，适合频繁出现，避免听觉疲劳。
- **重要/深沉**：`04-deep-dun.mp3` 或 `05-deep-dun-dun.mp3`。
- **揭示/长文案**：`06-cinematic-riser.mp3`；需要更长的氛围铺垫时用 `07-deep-swell.mp3`。
- **选中/确认**：`08-confirm-ping.mp3`。

同一页面不要每次弹窗都换音效；建议固定一个“默认音”，只在特殊文案类型（如“压轴”“转折”“确认”）时切换。

## 前端接入

```html
<script>
const SFX = {
  ding:      '/asset/sfx/01-ding-bell.mp3',
  message:   '/asset/sfx/02-message-tone.mp3',
  pop:       '/asset/sfx/03-ui-pop.mp3',
  deep:      '/asset/sfx/04-deep-dun.mp3',
  deepDouble:'/asset/sfx/05-deep-dun-dun.mp3',
  riser:     '/asset/sfx/06-cinematic-riser.mp3',
  swell:     '/asset/sfx/07-deep-swell.mp3',
  confirm:   '/asset/sfx/08-confirm-ping.mp3'
};

const cache = {};

function playSfx(name, volume = 0.45) {
  const src = SFX[name];
  if (!src) return;

  const audio = (cache[name] ||= new Audio(src));
  audio.pause();
  audio.currentTime = 0;
  audio.volume = volume;
  audio.play().catch(() => {
    // 浏览器可能因“无用户交互”拦截；不要在这里报错打断弹窗
  });
}

// 弹窗出现时：
// playSfx('ding', 0.45);

// 特殊文案：
// playSfx('deepDouble', 0.5);
</script>
```

路径按页面路由调整：根路径页面用 `/asset/sfx/...`，相对路径页面用 `../asset/sfx/...`。

**自动播放限制**：浏览器通常要求页面先发生一次点击/按键，才允许播放声音。把 `playSfx()` 放在“触发弹窗”的点击事件里最稳；如果是异步弹出，可在首次 `pointerdown` 时解锁音频。

**连续弹出**：上面的写法会复用同一个 `Audio` 对象，后一次会打断前一次。若需要叠音，用 `new Audio(src)` 每次新建，或做一个小的音频池。

## 授权与来源

全部为 **CC0 1.0 Universal（公共领域贡献）**，可商用、可修改、可再分发，无需署名。为可追溯，仍保留作者与来源：

| 文件 | 原音效 | 作者 | 来源 |
|---|---|---|---|
| `01` | Soft-Notifications - Bell - Ding-Dong | LegitCheese | [Freesound 571513](https://freesound.org/people/LegitCheese/sounds/571513/) |
| `02` | Text Tone 5 | dVidrio02 | [Freesound 636401](https://freesound.org/people/dVidrio02/sounds/636401/) |
| `03` | UI pop sound | Aesnas | [Freesound 812555](https://freesound.org/people/Aesnas/sounds/812555/) |
| `04` | deep_tom | stwime | [Freesound 555528](https://freesound.org/people/stwime/sounds/555528/) |
| `05` | 由 `04` 两次触发叠加而成 | stwime（原音） | [Freesound 555528](https://freesound.org/people/stwime/sounds/555528/) |
| `06` | Cinematic Riser #3 subtle | BeaconStudio | [Freesound 859482](https://freesound.org/people/BeaconStudio/sounds/859482/) |
| `07` | [Media] Deep Bass Swell App/Game SFX | waveplaySFX | [Freesound 518145](https://freesound.org/people/waveplaySFX/sounds/518145/) |
| `08` | Quiz Gameshow Correct Ping 14 | craigscottuk | [Freesound 644963](https://freesound.org/people/craigscottuk/sounds/644963/) |

CC0 不要求署名；如果你所在的平台要求列版权信息，可直接使用上表。

## 处理说明

- 已裁掉首尾多余静音，末尾加 50—500ms 淡出，避免爆音。
- 响度统一到约 **-18 至 -20 LUFS**，真峰值控制在 **-2 dBTP** 左右。
- 输出为 **44.1kHz / 立体声 / MP3**，单文件 8—90KB。
- 多数源文件是 Freesound 的 24kHz 试听版；对 UI 短音效足够。若追求母带级质量，可回源站下载原始档替换，文件名保持不变即可。

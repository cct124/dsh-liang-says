# 长风声源 / Wind Pack

为“字符和部分字符段飘入”准备的 6 条长音源 + 4 条预裁版。全部来自 Freesound 的 **CC0 1.0** 音频，可商用、可修改。

原来的 `06-cinematic-riser.mp3` 只有 2.12s，更像一个短 riser；这一包把“风声”单独拉长，方便按字符出现节奏做 in/out 点。长音源保留 8—36s，预裁版 3.8—5.5s，可直接用于弹窗。

## 长音源

| 文件 | 原音 | 时长 | 手感 | 推荐裁剪 |
|---|---|---:|---|---|
| [`wind-long-01-slow-air-whoosh.mp3`](wind-long-01-slow-air-whoosh.mp3) | Slow Air Whoosh | 25.78s | 慢速气流，两个自然起伏，噪声感强 | **2.0—7.5s** |
| [`wind-long-02-airy-whooshes.mp3`](wind-long-02-airy-whooshes.mp3) | Airy Whooshes | 9.67s | 多段处理过的 whoosh，颗粒更细 | 3.2—7.0s |
| [`wind-long-03-wind-gust.mp3`](wind-long-03-wind-gust.mp3) | Wind Gust | 18.19s | 真实走廊阵风，起伏明显 | **10.5—15.5s** |
| [`wind-long-04-soft-wind.mp3`](wind-long-04-soft-wind.mp3) | Soft Wind | 35.67s | 柔和环境风声，低频更多 | 13.5—20.0s |
| [`wind-long-05-formant-wind.mp3`](wind-long-05-formant-wind.mp3) | Formant Wind | 8.40s | 合成共振风，质感偏电子 | 0.0—5.0s |
| [`wind-long-06-long-swoosh.mp3`](wind-long-06-long-swoosh.mp3) | Long Swoosh | 11.27s | 长扫气声，带一点音调 | 0.5—4.5s |

加粗的推荐裁剪是“先试这一段”的意思，不是唯一答案；可以在 Audition 页里直接听推荐段。

## 预裁版

| 文件 | 听感 | 时长 | 来源 |
|---|---|---:|---|
| [`wind-ready-01-slow-rise.mp3`](wind-ready-01-slow-rise.mp3) | 慢速气流上升，最接近“字符飘入” | 5.50s | `wind-long-01` 2.0—7.5s |
| [`wind-ready-02-gust.mp3`](wind-ready-02-gust.mp3) | 阵风强调，适合转折/压轴 | 5.00s | `wind-long-03` 10.5—15.5s |
| [`wind-ready-03-swoosh.mp3`](wind-ready-03-swoosh.mp3) | 扫气转场，适合整块文字 | 4.00s | `wind-long-06` 0.5—4.5s |
| [`wind-ready-04-breath.mp3`](wind-ready-04-breath.mp3) | 细气轻飘，适合短句/频繁出现 | 3.80s | `wind-long-02` 3.2—7.0s |

## 怎么配“字符飘入”

- **整段文字飘入**：`wind-ready-01-slow-rise`。起点比第一字出现早 0.3—0.5s，峰值落在段落中段，末尾留 0.8—1.2s 淡出。
- **一句/一小段**：`wind-ready-04-breath`，音量比默认低 3—5dB，避免每次都像“阵风”。
- **转折/压轴**：`wind-ready-02-gust`。不要把整段 5s 全用完，取 2.5—3.5s 的峰值附近即可。
- **整块切换/页面转场**：`wind-ready-03-swoosh`。
- **铺底**：`wind-long-04-soft-wind` 截 8—12s，音量压到主音效的 30%—40%，只做空气感，不要让它抢字。
- **多层**：一层长风铺底 + 一层短 whoosh 落在字符落点，比单条长音更贴合“逐个字符出现”。

**频段建议**：风声容易和低频混在一起，做弹窗时 high-pass 到 120—180Hz，去掉无用的 rumble；如果高频太“嘶”，low-pass 到 10—12kHz。

**不要**：每次弹窗都从 25s 长音源的开头播放；也不要整段 35s 直接铺在短文案上。长音源是用来挑片段的。

## 试听与裁剪

直接用浏览器打开 [`audition.html`](audition.html)：

- 每条长音源有“播放全段”和“播放推荐段”两个按钮；
- 推荐段会按表中 in/out 点自动停止；
- 预裁版可直接点播。

## 接入

```js
const WIND = {
  slowRise: '/asset/sfx/wind/wind-ready-01-slow-rise.mp3',
  gust:     '/asset/sfx/wind/wind-ready-02-gust.mp3',
  swoosh:   '/asset/sfx/wind/wind-ready-03-swoosh.mp3',
  breath:   '/asset/sfx/wind/wind-ready-04-breath.mp3',
  bed:      '/asset/sfx/wind/wind-long-04-soft-wind.mp3'
};

function playWind(src, volume = 0.38) {
  const audio = new Audio(src);
  audio.volume = volume;
  audio.play().catch(() => {});
  return audio;
}

// 字符开始飘入时
// playWind(WIND.slowRise, 0.38);
```

同样注意浏览器自动播放限制：把播放调用放在点击/按键触发的弹窗逻辑里，或先做一次用户交互解锁。

## 授权与来源

全部为 **CC0 1.0 Universal**，可商用、可修改、可再分发，无需署名。为可追溯保留以下信息：

| 文件 | 原音 | 作者 | 来源 |
|---|---|---|---|
| `wind-long-01` | floating whoosh slow.wav | martian | [Freesound 19317](https://freesound.org/people/martian/sounds/19317/) |
| `wind-long-02` | Airy Whooshes.wav | Nic3_one | [Freesound 434872](https://freesound.org/people/Nic3_one/sounds/434872/) |
| `wind-long-03` | wind_gust.aif | joseph.larralde | [Freesound 352421](https://freesound.org/people/joseph.larralde/sounds/352421/) |
| `wind-long-04` | Soft Wind | florianreichelt | [Freesound 459977](https://freesound.org/people/florianreichelt/sounds/459977/) |
| `wind-long-05` | formant wind.wav | .Andre_Onate | [Freesound 149918](https://freesound.org/people/.Andre_Onate/sounds/149918/) |
| `wind-long-06` | Long_Swoosh_rhapsodize.wav | rhapsodize | [Freesound 688613](https://freesound.org/people/rhapsodize/sounds/688613/) |

**特别说明**：`wind-long-01` 的作者 martian 在 Freesound 描述里请求“网页使用时署名 www.fork-media.com”。虽然 CC0 不强制署名，建议在网页 credits 里加一句：

> Wind sound: “floating whoosh slow.wav” by martian / fork-media.com, CC0.

## 处理说明

- 长音源保留原始长度（`wind-long-05` 去掉了尾部约 9s 的静音）。
- 已做首尾淡入/淡出，响度统一在 **-20 LUFS** 左右，真峰值低于 **-5 dBTP**。
- 输出为 **44.1kHz / 立体声 / MP3**，长音源单文件 0.16—0.70MB。
- 预裁版从长音源直接裁出，已加淡入/淡出；如果你要自己裁，建议从长音源的推荐 in/out 点开始，再留 0.3—0.8s 的淡出。
- 源文件为 Freesound 试听版；若追求母带级质量，可回源站下载原始档替换同名文件，裁剪点仍然适用。

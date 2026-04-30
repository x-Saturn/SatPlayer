# SatPlayer

一个基于原生 JavaScript 的轻量网页音频播放器组件，包含歌单加载、播放控制、可拖动折叠按钮与小图标帧动画等功能。播放器的实现和歌单接口分别参考了[Aplayer](https://github.com/DIYgod/APlayer)和[MetingJS](https://github.com/metowolf/MetingJS)项目，相比Aplayer更加轻量和简洁。

## 快速开始

如果只想预览效果，下载完整源代码使用本地Live Server打开`preview.html`即可。

如果需要将SatPlayer添加到静态站点上：

1. 将整个 `SatPlayer/` 文件夹复制到你的项目的根目录中（该文件夹内已包含 `SatPlayer.js`、`SatPlayer.css` 和 `SatPlayer_img/`）。
2. 分别在`<head>`块和`<body>`块中引入样式和脚本（`preview.html` 已示例）：

```html
<link rel="stylesheet" href="./SatPlayer/SatPlayer.css">
<script src="./SatPlayer/SatPlayer.js"></script>
```

3. 在`<body>`块中添加播放器根节点（`preview.html` 已示例）：

```html
<div id="my-player-root" data-playlist-id="63531116"></div>
```

其中`data-playlist-id`为歌单id，目前只支持网易云音乐，网页版歌单url的最后几位数字即为歌单id，单次读入歌曲的上限是1000首。

## 配置项（部分）

目前除了`data-playlist-id`以外，所有的参数都只能在`SatPlayer.js`脚本和`SatPlayer.css`样式文件中更改，后续版本可能会做外部接口。

部分可以在`SatPlayer.js`中更改的参数：

- `initialTrackCount`：初始一次性加载的歌曲数量，默认值200,设为0意为最大值（1000首）。

- `audio.volume`：初始音量（0到1之间），默认值0.8。

- `longPressDelay`：激活拖拽行为所需的长按时间（ms），默认值100。

- `collapseAnimFrameDelay`：图标动画相邻两帧之间的间隔时间（ms），默认值160。

- `modeText`和`modeIconClass`：调整默认播放顺序及其对应按钮图标的函数，可以在“列表循环”、“随机”和“单曲循环”之间切换，默认模式为“列表循环”。

- `gap`：过长歌名或歌手名循环之间的间隔（px），默认值24。

- `duration`：过长歌名或歌手名单次循环所用的时间（s），默认固定循环速率为30 px/s。

大部分的CSS样式变量都定义在`SatPlayer.css`中的`:root{}`块，这里不一一赘述。

## 行为说明

- 折叠图标单击后展开播放器面板，再点一下左下角的倒三角按钮展开歌单。
- 折叠图标支持「长按拖动」以移动播放器到页面任意位置，拖动释放后不会自动折叠。
- 折叠图标使用 `SatPlayer_img/anim/` 目录下的 8 帧 SVG 进行循环帧动画：`icon-icons (0).svg` … `icon-icons (7).svg`，歌曲暂停时动画也暂停。
- 在小屏（默认阈值为 `max-width: 900px`，可在`SatPlayer.css`修改）时播放器默认折叠并固定在右上角，切换尺寸时会尝试恢复到合适位置以避免离屏。
- 歌单会在展开歌单或切换播放项时自动滚动，使当前播放项尽量靠近顶部。

## 可能的问题

- 脚本尝试在加载歌单的时候过滤掉VIP歌曲，但实际上无效。
- 折叠图标动画加载时会闪动。

## 写在最后

这是一个传说中vibe-coding产物（感谢GPT5！），我自己只做了配色和样式的确定及微调工作，完全不成熟，欢迎大家多多交流！

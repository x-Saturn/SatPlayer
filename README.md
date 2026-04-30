# SatPlayer

A lightweight web audio player component based on native JavaScript, featuring playlist loading, playback controls, a draggable collapsible button, and icon frame animation. The implementation of the player and the playlist interface refer to [Aplayer](https://github.com/DIYgod/APlayer) and [MetingJS](https://github.com/metowolf/MetingJS) respectively, but is lighter and more concise compared to Aplayer.

## Quick Start

If you just want to preview the effect, download the full source code and open `preview.html` in a **live server**.

To add SatPlayer to a static site:

1. Copy the entire `SatPlayer/` folder to your project's root directory (the folder includes `SatPlayer.js`, `SatPlayer.css`, and `SatPlayer_img/`).
2. Import the stylesheet and script in the `<head>` and `<body>` sections respectively (as shown in `preview.html`):

```html
<link rel="stylesheet" href="./SatPlayer/SatPlayer.css">
<script src="./SatPlayer/SatPlayer.js"></script>
```

3. Add the player root node in the `<body>` section (as shown in `preview.html`):

```html
<div id="my-player-root" data-playlist-id="63531116"></div>
```

Here `data-playlist-id` is the playlist ID. Currently only NetEase Cloud Music playlists are supported. The last few digits of the web playlist URL are the playlist ID. The maximum number of songs loaded at once is 1000.

## Configuration (Partial)

Apart from `data-playlist-id`, all other parameters can only be changed within the `SatPlayer.js` script and `SatPlayer.css` stylesheet. External interfaces might be provided in future versions.

Some parameters that can be changed in `SatPlayer.js`:

- `initialTrackCount`: Number of songs loaded initially. Default is 200. Setting it to 0 loads the maximum (1000 songs).

- `audio.volume`: Initial volume (a value between 0 and 1). Default is 0.8.

- `longPressDelay`: Time required to activate dragging (ms). Default is 100.

- `collapseAnimFrameDelay`: Interval between frames of the icon animation (ms). Default is 160.

- `modeText` and `modeIconClass`: Functions to adjust the default playback order and corresponding button icons. You can switch between "List Loop", "Random", and "Single Track Loop". The default mode is "List Loop".

- `gap`: Spacing (px) between loops for overly long song titles or artist names. Default is 24.

- `duration`: Time (s) for a single loop of an overly long song title or artist name. The default loop rate is fixed at 30 px/s.

Most CSS variables are defined in the `:root{}` block in `SatPlayer.css`, so they won't be listed here.

## Behavior Description

- Clicking the collapsed icon expands the player panel. Clicking the small triangle button at the bottom left again expands the playlist.
- The collapsed icon supports "long press and drag" to move the player to any position on the page. The player does not automatically collapse after dragging is released.
- The collapsed icon uses 8 frames of SVG located in the `SatPlayer_img/anim/` directory for looped animation: `icon-icons (0).svg` … `icon-icons (7).svg`. The animation pauses when the song is paused.
- On small screens (default threshold is `max-width: 900px`, adjustable in `SatPlayer.css`), the player is collapsed by default and fixed at the top right corner. When the window is resized, it attempts to restore a suitable position to avoid going off-screen.
- The playlist automatically scrolls when expanding the playlist or switching tracks, so that the currently playing item is positioned near the top.

## Known Issues

- The script attempts to filter out VIP songs when loading the playlist, but this does not actually work.
- The collapsed icon animation flickers when loading.

## Final Words

This is a so-called vibe-coding product (thank you GPT-5!). I only made adjustments and refinements to the color scheme and styling. It is far from mature. Feedback and suggestions are very welcome!

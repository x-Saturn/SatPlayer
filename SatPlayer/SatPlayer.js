// Custom playlist player for NetEase playlists.
// Features:
// 1) Fetch song list metadata by playlist id.
// 2) Play / pause, volume control, previous / next.
// 3) Play mode: list loop, random, single loop.
(function () {
    'use strict';

    var root = document.getElementById('my-player-root');
    if (!root) {
        return;
    }

    var playlistId = root.getAttribute('data-playlist-id') || window.myPlayerPlaylistId;
    if (!playlistId) {
        root.textContent = 'Player init failed: missing playlist id.';
        return;
    }

    // Keep compatibility with Meting-style endpoint.
    var apiTemplate = window.meting_api ||
        'https://api.injahow.cn/meting/?server=:server&type=:type&id=:id&r=:r';

    function normalizeBaseUrl(base) {
        var value = String(base || '').trim();
        if (!value) {
            return '';
        }
        return /\/$/.test(value) ? value : value + '/';
    }

    function resolveAssetBaseUrl() {
        var customBase = normalizeBaseUrl(window.myPlayerAssetBase);
        if (customBase) {
            return customBase;
        }

        var scriptSrc = '';
        if (document.currentScript && document.currentScript.src) {
            scriptSrc = document.currentScript.src;
        }

        if (!scriptSrc) {
            var scripts = document.getElementsByTagName('script');
            for (var i = scripts.length - 1; i >= 0; i -= 1) {
                var src = scripts[i].getAttribute('src') || '';
                if (/SatPlayer\.js(?:$|\?)/.test(src)) {
                    scriptSrc = src;
                    break;
                }
            }
        }

        if (scriptSrc) {
            try {
                return new URL('./SatPlayer_img/', scriptSrc).toString();
            } catch (e) {}
        }

        return './SatPlayer_img/';
    }

    var assetBaseUrl = resolveAssetBaseUrl();

    var state = {
        tracks: [],
        index: 0,
        mode: 'list', // list | random | single
        playlistOpen: false,
        collapsed: true
    };

    // Number of tracks to initialize on first load. 0 means all tracks.
    var initialTrackCount = Number(root.getAttribute('data-initial-count')) || Number(window.myPlayerInitialTrackCount) || 200;

    var audio = new Audio();
    audio.preload = 'auto';
    audio.volume = 0.8;

    var ui = {};
    // Drag state for long-press to move player
    var dragTimer = null;
    var dragActive = false;
    var dragPointerId = null;
    var dragStartX = 0;
    var dragStartY = 0;
    var containerStartLeft = 0;
    var containerStartTop = 0;
    var longPressDelay = 100; // ms
    var ignoreCollapseClickUntil = 0;
    var volumeCloseTimer = null;
    var fadeTimer = null;
    var fadeToken = 0;
    var switchToken = 0;
    var switchInProgress = false;
    var textMeasureTimer = null;
    var collapseAnimFrameUrls = [];
    var collapseAnimTimer = null;
    var collapseAnimFrameIndex = 0;
    var collapseAnimFrameDelay = 160; // ms per frame
    var collapseAnimReady = false;
    var collapseAnimPendingResume = false;
    var mobileQuery = window.matchMedia('(max-width: 900px)');
    var fadeDuration = {
        out: 220,
        in: 260,
        pause: 180,
        play: 220
    };

    for (var i = 0; i < 8; i += 1) {
        collapseAnimFrameUrls.push(assetBaseUrl + 'anim/icon-icons (' + i + ').svg');
    }

    function preloadCollapseIconFrames() {
        if (!collapseAnimFrameUrls.length) {
            collapseAnimReady = true;
            return;
        }

        var loadedCount = 0;
        var frameCount = collapseAnimFrameUrls.length;

        function markLoaded() {
            loadedCount += 1;
            if (loadedCount >= frameCount) {
                collapseAnimReady = true;
                if (collapseAnimPendingResume && !audio.paused) {
                    collapseAnimPendingResume = false;
                    resumeCollapseIconAnimation();
                }
            }
        }

        collapseAnimFrameUrls.forEach(function (src) {
            var img = new Image();
            img.onload = markLoaded;
            img.onerror = markLoaded;
            img.src = src;
        });
    }

    function buildApiUrl() {
        return apiTemplate
            .replace(':server', 'netease')
            .replace(':type', 'playlist')
            .replace(':id', encodeURIComponent(String(playlistId)))
            .replace(':auth', '')
            .replace(':r', String(Math.random()));
    }

    function el(tag, className, text) {
        var node = document.createElement(tag);
        if (className) {
            node.className = className;
        }
        if (typeof text === 'string') {
            node.textContent = text;
        }
        return node;
    }


    function modeText(mode) {
        if (mode === 'random') {
            return 'Random';
        }
        if (mode === 'single') {
            return 'Single';
        }
        return 'List';
    }

    function modeIconClass(mode) {
        if (mode === 'random') {
            return 'my-player-icon-random';
        }
        if (mode === 'single') {
            return 'my-player-icon-replay';
        }
        return 'my-player-icon-list';
    }

    function setStatus(text) {
        if (!ui.status) {
            return;
        }
        ui.status.textContent = text;
    }

    function syncPlayerCollapsedState() {
        if (!root) {
            return;
        }

        root.classList.toggle('is-collapsed', state.collapsed);
        root.classList.toggle('is-expanded', !state.collapsed);
        if (ui.collapseToggle) {
            ui.collapseToggle.setAttribute('title', state.collapsed ? 'Open Player' : 'Fold Player');
            ui.collapseToggle.setAttribute('aria-label', state.collapsed ? 'Open Player' : 'Fold Player');
        }
    }

    function resetPlayerPositionForMobile() {
        if (!root) {
            return;
        }

        root.style.removeProperty('position');
        root.style.removeProperty('left');
        root.style.removeProperty('top');
        root.style.removeProperty('right');
        root.style.removeProperty('bottom');
        root.style.removeProperty('margin');
    }

    function syncMobileCollapsedState() {
        if (!mobileQuery.matches) {
            resetPlayerPositionForMobile();
            return;
        }

        state.collapsed = true;
        resetPlayerPositionForMobile();
        syncPlayerCollapsedState();
    }

    function syncTextMarquee() {
        [ui.title, ui.artist].forEach(function (node) {
            if (!node) {
                return;
            }

            // teardown existing marquee if present — remove marquee DOM but
            // do NOT overwrite the node.textContent because syncMeta may
            // already have set the new track text. This prevents reverting
            // to the previous track's text when switching songs.
            node.classList.remove('is-marquee');
            node.style.removeProperty('--marquee-distance');
            node.style.removeProperty('--marquee-duration');
            var existing = node.querySelector('.marquee-track-container');
            if (existing) {
                existing.remove();
            }
            if (node.dataset.origText) {
                delete node.dataset.origText;
            }

            // original full text width
            var textWidth = node.scrollWidth;
            // compute overflow in px; treat tiny overflows as visible
            // and only skip marquee when overflow is negligible (<=1px)
            var overflow = textWidth - node.clientWidth;
            if (overflow <= 1) {
                return;
            }

            // distance: full text width + gap between repeats
            var gap = 24; // px between repeats
            var distance = textWidth + gap; // px
            // fixed scroll speed: 30px per second
            var duration = distance / 30; // seconds

            // create duplicated track for seamless looping
            var origText = node.textContent;
            node.dataset.origText = origText;
            node.textContent = '';

            var trackContainer = el('div', 'marquee-track-container');
            // first render: no extra left padding so the full text is visible
            // immediately; subsequent loops will naturally bring the second
            // copy from the right because it's placed after the first + gap.
            var track1 = el('span', 'marquee-track', origText);
            var track2 = el('span', 'marquee-track', origText);
            trackContainer.appendChild(track1);
            trackContainer.appendChild(track2);
            node.appendChild(trackContainer);

            node.style.setProperty('--marquee-distance', distance + 'px');
            node.style.setProperty('--marquee-duration', duration + 's');
            node.classList.add('is-marquee');

            // ensure the new marquee container follows the current audio
            // play/pause state (paused -> animation paused)
            if (audio && audio.paused) {
                trackContainer.style.animationPlayState = 'paused';
            } else {
                trackContainer.style.animationPlayState = 'running';
            }
        });
    }

    function updateMarqueeAnimationState() {
        var running = !(audio && audio.paused);
        [ui.title, ui.artist].forEach(function (node) {
            if (!node) return;
            var container = node.querySelector('.marquee-track-container');
            if (container) {
                container.style.animationPlayState = running ? 'running' : 'paused';
            }
        });
    }

    function queueTextMarqueeSync() {
        if (textMeasureTimer) {
            clearTimeout(textMeasureTimer);
        }
        textMeasureTimer = setTimeout(function () {
            syncTextMarquee();
            textMeasureTimer = null;
        }, 40);
    }

    function setCollapseIconFrame(frameIndex) {
        if (!ui.collapseIcon || !collapseAnimFrameUrls.length) {
            return;
        }

        collapseAnimFrameIndex = frameIndex % collapseAnimFrameUrls.length;
        ui.collapseIcon.style.backgroundImage = 'url("' + collapseAnimFrameUrls[collapseAnimFrameIndex] + '")';
    }

    function resumeCollapseIconAnimation() {
        if (!ui.collapseIcon || !collapseAnimFrameUrls.length) {
            return;
        }

        if (!collapseAnimReady) {
            collapseAnimPendingResume = true;
            return;
        }

        if (collapseAnimTimer) {
            return;
        }

        collapseAnimTimer = setInterval(function () {
            setCollapseIconFrame((collapseAnimFrameIndex + 1) % collapseAnimFrameUrls.length);
        }, collapseAnimFrameDelay);
    }

    function pauseCollapseIconAnimation() {
        collapseAnimPendingResume = false;
        if (collapseAnimTimer) {
            clearInterval(collapseAnimTimer);
            collapseAnimTimer = null;
        }
    }

    function clampVolume(value) {
        var volume = Number(value);
        if (Number.isNaN(volume)) {
            return 0.8;
        }
        if (volume < 0) {
            return 0;
        }
        if (volume > 1) {
            return 1;
        }
        return volume;
    }

    function getTargetVolume() {
        if (!ui.volume) {
            return 0.8;
        }
        return clampVolume(ui.volume.value);
    }

    function stopFade() {
        fadeToken += 1;
        if (fadeTimer) {
            clearInterval(fadeTimer);
            fadeTimer = null;
        }
    }

    function fadeAudioTo(targetVolume, duration, onDone) {
        stopFade();

        var token = fadeToken;
        var from = clampVolume(audio.volume);
        var to = clampVolume(targetVolume);
        if (duration <= 0 || Math.abs(from - to) < 0.01) {
            audio.volume = to;
            if (typeof onDone === 'function') {
                onDone();
            }
            return;
        }

        var start = Date.now();
        fadeTimer = setInterval(function () {
            if (token !== fadeToken) {
                clearInterval(fadeTimer);
                fadeTimer = null;
                return;
            }

            var progress = (Date.now() - start) / duration;
            if (progress >= 1) {
                clearInterval(fadeTimer);
                fadeTimer = null;
                audio.volume = to;
                if (typeof onDone === 'function') {
                    onDone();
                }
                return;
            }

            audio.volume = from + (to - from) * progress;
        }, 16);
    }

    function syncMeta() {
        if (!state.tracks.length) {
            ui.title.textContent = 'No track available';
            ui.artist.textContent = '-';
            ui.cover.removeAttribute('src');
            queueTextMarqueeSync();
            return;
        }

        var current = state.tracks[state.index];
        ui.title.textContent = current.name || 'Unknown title';
        ui.artist.textContent = current.artist || 'Unknown artist';

        if (current.cover) {
            ui.cover.src = current.cover;
        } else {
            ui.cover.removeAttribute('src');
        }

        // update custom list highlight
        if (ui.customListUl) {
            Array.prototype.forEach.call(ui.customListUl.children, function (li) {
                li.classList.remove('is-playing');
            });
            var curLi = ui.customListUl.children[state.index];
            if (curLi) {
                curLi.classList.add('is-playing');
            }
        }
        scrollPlayingTrackToTop();
        queueTextMarqueeSync();
    }

    function scrollPlayingTrackToTop() {
        if (!ui.customList || !ui.customListUl || !state.playlistOpen) {
            return;
        }

        var curLi = ui.customListUl.children[state.index];
        if (!curLi) {
            return;
        }

        var targetTop = curLi.offsetTop - (ui.customListUl.offsetTop || 0);
        if (targetTop < 0) {
            targetTop = 0;
        }

        if (typeof ui.customList.scrollTo === 'function') {
            ui.customList.scrollTo({
                top: targetTop,
                behavior: 'smooth'
            });
        } else {
            ui.customList.scrollTop = targetTop;
        }
    }

    function syncPlaylistVisibility() {
        if (!ui.playlistWrap) {
            return;
        }

        ui.playlistWrap.classList.toggle('is-collapsed', !state.playlistOpen);
        ui.playlistToggleIcon.className = 'my-player-icon my-player-icon-open' + (state.playlistOpen ? ' is-open' : '');
        ui.playlistToggle.setAttribute('title', state.playlistOpen ? 'Fold Playlist' : 'Open Playlist');
        ui.playlistToggle.setAttribute('aria-label', state.playlistOpen ? 'Fold Playlist' : 'Open Playlist');

        if (ui.customList) {
            ui.customList.style.display = state.playlistOpen ? 'block' : 'none';
            if (state.playlistOpen) {
                requestAnimationFrame(scrollPlayingTrackToTop);
            }
        }
    }

    function openVolumePanel() {
        if (!ui.volumeWrap) {
            return;
        }

        if (volumeCloseTimer) {
            clearTimeout(volumeCloseTimer);
            volumeCloseTimer = null;
        }
        ui.volumeWrap.classList.add('is-open');
    }

    function closeVolumePanel() {
        if (!ui.volumeWrap) {
            return;
        }

        if (volumeCloseTimer) {
            clearTimeout(volumeCloseTimer);
        }

        volumeCloseTimer = setTimeout(function () {
            ui.volumeWrap.classList.remove('is-open');
            volumeCloseTimer = null;
        }, 140);
    }

    function syncPlayButton() {
        var isPaused = audio.paused;
        ui.playPauseIcon.className = 'my-player-icon ' + (isPaused ? 'my-player-icon-play' : 'my-player-icon-pause');
        ui.playPause.setAttribute('title', isPaused ? 'Play' : 'Pause');
        ui.playPause.setAttribute('aria-label', isPaused ? 'Play' : 'Pause');
    }

    function loadTrack(index, autoplay) {
        if (!state.tracks.length) {
            return;
        }

        var safeIndex = index;
        if (safeIndex < 0) {
            safeIndex = state.tracks.length - 1;
        }
        if (safeIndex >= state.tracks.length) {
            safeIndex = 0;
        }

        state.index = safeIndex;
        var current = state.tracks[state.index];
        audio.src = current.url;
        syncMeta();
        setStatus('Ready');

        if (autoplay) {
            audio.play().catch(function () {
                setStatus('Autoplay blocked by browser. Click Play.');
            });
        }
    }

    function startTrackWithFade(index, autoplay) {
        var shouldPlay = autoplay !== false;
        var token = switchToken;
        var targetVolume = getTargetVolume();

        loadTrack(index, false);

        if (!shouldPlay) {
            audio.volume = targetVolume;
            switchInProgress = false;
            return;
        }

        audio.volume = 0;
        audio.play().then(function () {
            if (token !== switchToken) {
                return;
            }
            fadeAudioTo(targetVolume, fadeDuration.in, function () {
                if (token === switchToken) {
                    switchInProgress = false;
                }
            });
        }).catch(function () {
            if (token === switchToken) {
                switchInProgress = false;
            }
            audio.volume = targetVolume;
            setStatus('Cannot start playback.');
        });
    }

    function switchTrackWithFade(index, autoplay) {
        if (!state.tracks.length) {
            return;
        }

        switchToken += 1;
        var token = switchToken;
        var isPlaying = !audio.paused;
        switchInProgress = true;

        if (!isPlaying || audio.volume <= 0.01) {
            startTrackWithFade(index, autoplay);
            return;
        }

        fadeAudioTo(0, fadeDuration.out, function () {
            if (token !== switchToken) {
                return;
            }
            startTrackWithFade(index, autoplay);
        });
    }

    function pickRandomIndex() {
        if (state.tracks.length <= 1) {
            return state.index;
        }

        var next = state.index;
        while (next === state.index) {
            next = Math.floor(Math.random() * state.tracks.length);
        }
        return next;
    }

    function nextTrack(autoplay) {
        if (!state.tracks.length) {
            return;
        }

        if (state.mode === 'single') {
            switchTrackWithFade(state.index, autoplay);
            return;
        }

        var nextIndex = state.mode === 'random' ? pickRandomIndex() : state.index + 1;
        switchTrackWithFade(nextIndex, autoplay);
    }

    function prevTrack(autoplay) {
        if (!state.tracks.length) {
            return;
        }

        if (state.mode === 'single') {
            switchTrackWithFade(state.index, autoplay);
            return;
        }

        var prevIndex = state.mode === 'random' ? pickRandomIndex() : state.index - 1;
        switchTrackWithFade(prevIndex, autoplay);
    }

    function toggleMode() {
        if (state.mode === 'list') {
            state.mode = 'random';
        } else if (state.mode === 'random') {
            state.mode = 'single';
        } else {
            state.mode = 'list';
        }
        ui.modeIcon.className = 'my-player-icon ' + modeIconClass(state.mode);
        ui.mode.setAttribute('title', 'Mode: ' + modeText(state.mode));
        ui.mode.setAttribute('aria-label', 'Mode: ' + modeText(state.mode));
    }

    function togglePlaylist() {
        state.playlistOpen = !state.playlistOpen;
        syncPlaylistVisibility();
    }

    function bindAudioEvents() {
        audio.addEventListener('play', function () {
            setStatus('Playing');
            syncPlayButton();
            updateMarqueeAnimationState();
            resumeCollapseIconAnimation();
        });

        audio.addEventListener('pause', function () {
            setStatus('Paused');
            syncPlayButton();
            updateMarqueeAnimationState();
            pauseCollapseIconAnimation();
        });

        audio.addEventListener('ended', function () {
            if (state.mode === 'single') {
                switchTrackWithFade(state.index, true);
                return;
            }
            nextTrack(true);
        });

        audio.addEventListener('error', function () {
            setStatus('Current track failed, switching to next...');
            nextTrack(true);
        });
    }

    function bindUiEvents() {
        if (ui.collapseToggle) {
            ui.collapseToggle.addEventListener('click', function (ev) {
                // prevent accidental toggle caused by pointerup/click after dragging
                if (Date.now() < ignoreCollapseClickUntil) {
                    ev.preventDefault();
                    return;
                }

                state.collapsed = !state.collapsed;
                syncPlayerCollapsedState();
            });
        }

        ui.playPause.addEventListener('click', function () {
            if (!state.tracks.length) {
                return;
            }

            if (switchInProgress) {
                return;
            }

            if (audio.paused) {
                var playTargetVolume = getTargetVolume();
                stopFade();
                audio.volume = 0;
                audio.play().then(function () {
                    fadeAudioTo(playTargetVolume, fadeDuration.play);
                }).catch(function () {
                    setStatus('Cannot start playback.');
                });
            } else {
                var pauseTargetVolume = getTargetVolume();
                fadeAudioTo(0, fadeDuration.pause, function () {
                    audio.pause();
                    audio.volume = pauseTargetVolume;
                });
            }
        });

        ui.prev.addEventListener('click', function () {
            prevTrack(true);
        });

        ui.next.addEventListener('click', function () {
            nextTrack(true);
        });

        ui.mode.addEventListener('click', toggleMode);

        ui.playlistToggle.addEventListener('click', togglePlaylist);

        ui.volumeWrap.addEventListener('mouseenter', openVolumePanel);
        ui.volumeWrap.addEventListener('mouseleave', closeVolumePanel);
        ui.volumeWrap.addEventListener('focusin', openVolumePanel);
        ui.volumeWrap.addEventListener('focusout', closeVolumePanel);

        ui.volume.addEventListener('input', function () {
            var nextVolume = getTargetVolume();
            if (switchInProgress) {
                return;
            }
            stopFade();
            audio.volume = nextVolume;
        });

        window.addEventListener('resize', queueTextMarqueeSync);
        if (mobileQuery.addEventListener) {
            mobileQuery.addEventListener('change', syncMobileCollapsedState);
        } else if (mobileQuery.addListener) {
            mobileQuery.addListener(syncMobileCollapsedState);
        }

        // Long-press on collapse icon (detail.svg mask) to enable dragging the whole player
        if (ui.collapseIcon && root) {
            ui.collapseIcon.addEventListener('pointerdown', function (ev) {
                if (dragTimer) {
                    clearTimeout(dragTimer);
                }
                // remember initial pointer
                dragStartX = ev.clientX;
                dragStartY = ev.clientY;

                // start long-press timer
                dragTimer = setTimeout(function () {
                    dragTimer = null;
                    dragActive = true;
                    dragPointerId = ev.pointerId;

                    // ensure root is positioned so we can move it
                    var rect = root.getBoundingClientRect();
                    containerStartLeft = rect.left;
                    containerStartTop = rect.top;

                    // switch to fixed positioning while preserving size
                    root.style.position = 'fixed';
                    root.style.left = containerStartLeft + 'px';
                    root.style.top = containerStartTop + 'px';
                    root.style.margin = '0';
                    root.classList.add('is-dragging');

                    try {
                        ev.target.setPointerCapture(dragPointerId);
                    } catch (e) {}
                }, longPressDelay);
            });

            ui.collapseIcon.addEventListener('pointermove', function (ev) {
                // if user moves pointer significantly before long-press, cancel
                if (dragTimer && (Math.abs(ev.clientX - dragStartX) > 6 || Math.abs(ev.clientY - dragStartY) > 6)) {
                    clearTimeout(dragTimer);
                    dragTimer = null;
                }

                if (!dragActive) return;
                if (ev.pointerId !== dragPointerId) return;

                var dx = ev.clientX - dragStartX;
                var dy = ev.clientY - dragStartY;
                root.style.left = (containerStartLeft + dx) + 'px';
                root.style.top = (containerStartTop + dy) + 'px';
            });

            var endDragHandler = function (ev) {
                if (dragTimer) {
                    clearTimeout(dragTimer);
                    dragTimer = null;
                }

                if (dragActive && ev.pointerId && ev.pointerId !== dragPointerId) {
                    return;
                }

                if (dragActive) {
                    dragActive = false;
                    dragPointerId = null;
                    // pointerup after dragging will still fire click on toggle; ignore it once
                    ignoreCollapseClickUntil = Date.now() + 100;
                    // keep the player at final fixed position, remove dragging class
                    root.classList.remove('is-dragging');
                    try {
                        ev.target.releasePointerCapture && ev.target.releasePointerCapture(ev.pointerId);
                    } catch (e) {}
                }
            };

            ui.collapseIcon.addEventListener('pointerup', endDragHandler);
            ui.collapseIcon.addEventListener('pointercancel', endDragHandler);
            // also listen globally so drag ends if pointer leaves icon
            document.addEventListener('pointerup', endDragHandler);
            document.addEventListener('pointercancel', endDragHandler);
        }
    }

    function render() {
        root.classList.add('my-player-root');
        root.classList.add('is-collapsed');

        var collapseToggle = el('button', 'my-player-collapse-toggle');
        collapseToggle.setAttribute('type', 'button');
        collapseToggle.setAttribute('title', '展开播放器');
        collapseToggle.setAttribute('aria-label', '展开播放器');
        var collapseIcon = el('span', 'my-player-collapse-icon');
        collapseToggle.appendChild(collapseIcon);

        var panel = el('section', 'my-player');
        var header = el('div', 'my-player-header');
        var cover = el('img', 'my-player-cover');
        cover.alt = 'album cover';

        var right = el('div', 'my-player-right');
        var meta = el('div', 'my-player-meta');
        var title = el('div', 'my-player-title', 'Loading playlist...');
        var artist = el('div', 'my-player-artist', '-');
        meta.appendChild(title);
        meta.appendChild(artist);

        var controls = el('div', 'my-player-controls');
        var prev = el('button', 'my-player-btn my-player-btn-icon');
        prev.setAttribute('type', 'button');
        prev.setAttribute('title', 'Previous');
        prev.setAttribute('aria-label', 'Previous');
        var prevIcon = el('span', 'my-player-icon my-player-icon-prev');
        prev.appendChild(prevIcon);

        var playPause = el('button', 'my-player-btn my-player-btn-icon');
        playPause.setAttribute('type', 'button');
        playPause.setAttribute('title', 'Play');
        playPause.setAttribute('aria-label', 'Play');
        var playPauseIcon = el('span', 'my-player-icon my-player-icon-play');
        playPause.appendChild(playPauseIcon);

        var next = el('button', 'my-player-btn my-player-btn-icon');
        next.setAttribute('type', 'button');
        next.setAttribute('title', 'Next');
        next.setAttribute('aria-label', 'Next');
        var nextIcon = el('span', 'my-player-icon my-player-icon-next');
        next.appendChild(nextIcon);

        var mode = el('button', 'my-player-btn my-player-btn-icon');
        mode.setAttribute('type', 'button');
        mode.setAttribute('title', 'Mode: ' + modeText(state.mode));
        mode.setAttribute('aria-label', 'Mode: ' + modeText(state.mode));
        var modeIcon = el('span', 'my-player-icon ' + modeIconClass(state.mode));
        mode.appendChild(modeIcon);

        var playlistToggle = el('button', 'my-player-btn my-player-btn-icon');
        playlistToggle.setAttribute('type', 'button');
        playlistToggle.setAttribute('title', 'Fold playlist');
        playlistToggle.setAttribute('aria-label', 'Fold playlist');
        var playlistToggleIcon = el('span', 'my-player-icon my-player-icon-open is-open');
        playlistToggle.appendChild(playlistToggleIcon);

        var volumeWrap = el('div', 'my-player-volume');
        var volumeButton = el('button', 'my-player-btn my-player-btn-icon');
        volumeButton.setAttribute('type', 'button');
        volumeButton.setAttribute('title', 'Volume');
        volumeButton.setAttribute('aria-label', 'Volume');
        var volumeIcon = el('span', 'my-player-icon my-player-icon-volume');
        volumeButton.appendChild(volumeIcon);

        var volumePanel = el('div', 'my-player-volume-panel');
        var volume = el('input', 'my-player-volume-range');
        volume.id = 'my-player-volume-range';
        volume.type = 'range';
        volume.min = '0';
        volume.max = '1';
        volume.step = '0.01';
        volume.value = String(audio.volume);
        volume.setAttribute('aria-label', 'Volume level');
        volumePanel.appendChild(volume);
        volumeWrap.appendChild(volumeButton);
        volumeWrap.appendChild(volumePanel);

        controls.appendChild(playlistToggle);
        controls.appendChild(prev);
        controls.appendChild(playPause);
        controls.appendChild(next);
        controls.appendChild(mode);
        controls.appendChild(volumeWrap);

        right.appendChild(meta);
        right.appendChild(controls);
        header.appendChild(cover);
        header.appendChild(right);

        var songListWrap = el('div', 'my-player-list-wrap');
        // custom expanded list (hidden when collapsed)
        var customList = el('div', 'my-player-custom-list');
        var customUl = el('ul', 'my-player-ul');
        customList.appendChild(customUl);
        songListWrap.appendChild(customList);

        panel.appendChild(header);
        panel.appendChild(songListWrap);
        root.appendChild(collapseToggle);
        root.appendChild(panel);

        ui.cover = cover;
        ui.title = title;
        ui.artist = artist;
        ui.status = null;
        ui.prev = prev;
        ui.playPause = playPause;
        ui.playPauseIcon = playPauseIcon;
        ui.next = next;
        ui.mode = mode;
        ui.modeIcon = modeIcon;
        ui.playlistToggle = playlistToggle;
        ui.playlistToggleIcon = playlistToggleIcon;
        ui.volumeWrap = volumeWrap;
        ui.volumeBtn = volumeButton;
        ui.volumePanel = volumePanel;
        ui.volume = volume;
        ui.playlistWrap = songListWrap;
        ui.customList = customList;
        ui.customListUl = customUl;
        ui.collapseToggle = collapseToggle;
        ui.collapseIcon = collapseIcon;

        syncMobileCollapsedState();
        syncPlayerCollapsedState();
        syncPlayButton();
        syncPlaylistVisibility();
        queueTextMarqueeSync();
    }

    function isVipOnlyTrack(item) {
        if (!item) {
            return true;
        }

        var privilege = item.privilege || {};
        return item.vip === true || item.vip === 1 || item.fee === 1 || item.feeType === 1 || privilege.fee === 1 || privilege.feeType === 1;
    }

    function normalizeTracks(rawList) {
        return rawList
            .filter(function (item) {
                return !!item && !!item.url && !isVipOnlyTrack(item);
            })
            .map(function (item) {
                return {
                    name: item.name || item.title || 'Unknown title',
                    artist: item.artist || item.author || 'Unknown artist',
                    cover: item.cover || item.pic || '',
                    url: item.url || ''
                };
            })
            ;
    }

    function fillSongList() {
        if (ui.customListUl) {
            ui.customListUl.innerHTML = '';
        }

        state.tracks.forEach(function (track, index) {
            if (ui.customListUl) {
                var li = document.createElement('li');
                li.dataset.index = String(index);
                li.textContent = (index + 1) + '. ' + track.name + ' - ' + track.artist;
                li.setAttribute('role', 'option');
                li.addEventListener('click', function () {
                    var idx = Number(this.dataset.index);
                    switchTrackWithFade(idx, true);
                });
                ui.customListUl.appendChild(li);
            }
        });
    }

    function fetchPlaylist() {
        setStatus('Fetching playlist...');

        return fetch(buildApiUrl())
            .then(function (res) {
                if (!res.ok) {
                    throw new Error('Network response was not ok: ' + res.status);
                }
                return res.json();
            })
            .then(function (rawList) {
                // Some APIs return [] directly, others return { data: [] }.
                var payload = rawList;
                if (!Array.isArray(payload) && payload && Array.isArray(payload.data)) {
                    payload = payload.data;
                }
                var tracks = normalizeTracks(Array.isArray(payload) ? payload : []);
                if (!tracks.length) {
                    throw new Error('No playable tracks returned by API.');
                }
                if (initialTrackCount > 0) {
                    tracks = tracks.slice(0, initialTrackCount);
                }
                state.tracks = tracks;
                fillSongList();
                loadTrack(0, false);
                setStatus('Playlist loaded: ' + state.tracks.length + ' tracks');
                state.playlistOpen = false;
                syncPlaylistVisibility();
            })
            .catch(function (error) {
                setStatus('Failed to load playlist. ' + error.message);
            });
    }

    function init() {
        preloadCollapseIconFrames();
        render();
        setCollapseIconFrame(0);
        bindAudioEvents();
        bindUiEvents();
        fetchPlaylist();
    }

    init();
})();

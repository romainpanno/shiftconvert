import { useState, useCallback, useRef, useEffect, useLayoutEffect } from 'react';
import {
  Upload, Play, Pause, Download, X, ZoomIn, ZoomOut, Film, Music, Volume2, Trash2, Monitor,
} from 'lucide-react';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';
import { useLanguage } from '../../i18n';
import { consumePendingFiles } from '../../stores/pendingFiles';

// ─── Types ────────────────────────────────────────────────────────────────────

interface MediaClip {
  id: string;
  type: 'video' | 'image';
  file: File;
  name: string;
  objectUrl: string;
  timelineStart: number;   // seconds on timeline
  displayDuration: number; // seconds shown on timeline
  sourceDuration: number;  // real media duration
  sourceWidth: number;
  sourceHeight: number;
  trimStart: number;       // seconds into source
  trimEnd: number;         // seconds into source (= sourceDuration initially)
  muteVideoAudio: boolean;
  trackIndex: number;      // video track lane (0 = bottom layer)
}

interface AudioTrackClip {
  id: string;
  file: File;
  name: string;
  objectUrl: string;
  timelineStart: number;
  displayDuration: number;
  sourceDuration: number;
  trimStart: number;
  trimEnd: number;
  volume: number;
  trackIndex: number;      // audio track lane
}

type DragMode =
  | { kind: 'none' }
  | { kind: 'clipMove'; clipId: string; track: 'video' | 'audio'; trackIndex: number; offsetSec: number }
  | { kind: 'trimLeft'; clipId: string; track: 'video' | 'audio' }
  | { kind: 'trimRight'; clipId: string; track: 'video' | 'audio' }
  | { kind: 'playhead' };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function genId() { return Math.random().toString(36).slice(2, 9); }

function formatSec(s: number) {
  const m = Math.floor(s / 60);
  const sec = (s % 60).toFixed(1);
  return `${m}:${parseFloat(sec) < 10 ? '0' : ''}${sec}`;
}

function getMediaDuration(url: string, isVideo: boolean): Promise<number> {
  return new Promise((resolve) => {
    const el = isVideo
      ? document.createElement('video')
      : document.createElement('audio');
    el.preload = 'metadata';
    el.src = url;
    el.onloadedmetadata = () => resolve(el.duration || 5);
    el.onerror = () => resolve(5);
  });
}

function getImageSize(url: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.src = url;
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => resolve({ w: 1920, h: 1080 });
  });
}

const SNAP_THRESHOLD_PX = 8;
const TRACK_H = 48;    // px height of a clip row
const LABEL_W = 48;    // px width of the track label column
const RULER_H = 28;    // px height of the ruler
const SECTION_GAP = 6; // px gap between video and audio sections

const RATIO_PRESETS = [
  { id: '16:9',  label: '16:9',  w: 1280, h: 720  },
  { id: '9:16',  label: '9:16',  w: 720,  h: 1280 },
  { id: '4:3',   label: '4:3',   w: 960,  h: 720  },
  { id: '1:1',   label: '1:1',   w: 720,  h: 720  },
  { id: '21:9',  label: '21:9',  w: 1260, h: 540  },
];

// ─── Component ────────────────────────────────────────────────────────────────

export function VideoEditor() {
  const { t } = useLanguage();

  // Mobile detection
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // State
  const [clips, setClips] = useState<MediaClip[]>([]);
  const [audioClips, setAudioClips] = useState<AudioTrackClip[]>([]);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [playhead, setPlayhead] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [zoomPxPerSec, setZoomPxPerSec] = useState(80);
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [outputUrl, setOutputUrl] = useState<string | null>(null);
  const [isDraggingMedia, setIsDraggingMedia] = useState(false);

  // Track counts
  const [videoTrackCount, setVideoTrackCount] = useState(1);
  const [audioTrackCount, setAudioTrackCount] = useState(0);

  // Output dimensions & scaling
  const [ratioPreset, setRatioPreset] = useState('16:9');
  const [outW, setOutW] = useState(1280);
  const [outH, setOutH] = useState(720);
  const [customW, setCustomW] = useState(1280);
  const [customH, setCustomH] = useState(720);
  const [fitMode, setFitMode] = useState<'fit' | 'fill' | 'stretch'>('fit');

  // Derived canvas preview size (keeps same area as ~640×360)
  const previewScale = Math.min(640 / outW, 360 / outH);
  const canvasW = Math.max(160, Math.round(outW * previewScale));
  const canvasH = Math.max(90,  Math.round(outH * previewScale));

  // Stable ref for fitMode to avoid stale closures in drawFrame
  const fitModeRef = useRef<'fit' | 'fill' | 'stretch'>('fit');
  fitModeRef.current = fitMode;

  // Drag
  const dragRef = useRef<DragMode>({ kind: 'none' });
  const dragStartXRef = useRef(0);
  const dragStartValRef = useRef(0);

  // RAF / playback
  const rafRef = useRef<number | null>(null);
  const playStartTimeRef = useRef(0);
  const playStartPlayheadRef = useRef(0);
  const isPlayingRef = useRef(false);

  // Canvas
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hiddenVideoEls = useRef<Map<string, HTMLVideoElement>>(new Map());
  const hiddenAudioEls = useRef<Map<string, HTMLAudioElement>>(new Map());
  const imageEls = useRef<Map<string, HTMLImageElement>>(new Map());

  // Stable refs to avoid stale closures in event handlers
  const drawFrameRef = useRef<(sec: number) => void>(() => {});
  const playheadRef = useRef(0);
  const totalDurationRef = useRef(5);
  const handlePlayPauseRef = useRef<() => void>(() => {});

  // FFmpeg
  const ffmpegRef = useRef<FFmpeg | null>(null);

  // Timeline scrollable container
  const timelineRef = useRef<HTMLDivElement>(null);

  // File input refs
  const mediaInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);

  // ── Derived ────────────────────────────────────────────────────────────────

  const totalDuration = Math.max(
    ...clips.map((c) => c.timelineStart + c.displayDuration),
    ...audioClips.map((a) => a.timelineStart + a.displayDuration),
    5,
  );

  const selectedClip = clips.find((c) => c.id === selectedClipId) ?? null;

  // Keep stable refs current every render
  playheadRef.current = playhead;
  totalDurationRef.current = totalDuration;

  // ── Hidden video element management ───────────────────────────────────────

  useEffect(() => {
    for (const clip of clips) {
      if (clip.type === 'video') {
        if (!hiddenVideoEls.current.has(clip.id)) {
          const vid = document.createElement('video');
          vid.src = clip.objectUrl;
          vid.preload = 'auto';
          vid.muted = true;
          vid.playsInline = true;
          // After a seek completes, always redraw — covers paused AND playback transitions
          vid.onseeked = () => {
            drawFrameRef.current(playheadRef.current);
          };
          hiddenVideoEls.current.set(clip.id, vid);
        }
      }
      if (clip.type === 'image') {
        if (!imageEls.current.has(clip.id)) {
          const img = new Image();
          img.src = clip.objectUrl;
          img.onload = () => {
            if (!isPlayingRef.current) drawFrameRef.current(playheadRef.current);
          };
          imageEls.current.set(clip.id, img);
        }
      }
    }
    for (const [id, vid] of hiddenVideoEls.current) {
      if (!clips.find((c) => c.id === id)) {
        vid.onseeked = null;
        vid.src = '';
        hiddenVideoEls.current.delete(id);
      }
    }
    for (const [id] of imageEls.current) {
      if (!clips.find((c) => c.id === id && c.type === 'image')) {
        imageEls.current.delete(id);
      }
    }
  }, [clips]);

  // ── Hidden audio element management ───────────────────────────────────────

  useEffect(() => {
    for (const clip of audioClips) {
      if (!hiddenAudioEls.current.has(clip.id)) {
        const aud = document.createElement('audio');
        aud.src = clip.objectUrl;
        aud.preload = 'auto';
        hiddenAudioEls.current.set(clip.id, aud);
      }
      // Keep volume in sync
      const aud = hiddenAudioEls.current.get(clip.id);
      if (aud) aud.volume = clip.volume;
    }
    for (const [id, aud] of hiddenAudioEls.current) {
      if (!audioClips.find((a) => a.id === id)) {
        aud.pause();
        aud.src = '';
        hiddenAudioEls.current.delete(id);
      }
    }
  }, [audioClips]);

  // ── Canvas drawing ─────────────────────────────────────────────────────────

  const drawFrame = useCallback((sec: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const cw = canvas.width;
    const ch = canvas.height;

    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, cw, ch);

    // Collect all active clips at `sec`.
    // Higher trackIndex = lower in timeline = rendered first (behind).
    // V1 (index 0) = topmost track = rendered last = appears on top.
    const activeClips = clips
      .filter((c) => sec >= c.timelineStart && sec < c.timelineStart + c.displayDuration)
      .sort((a, b) => b.trackIndex - a.trackIndex);

    if (activeClips.length === 0) return;

    const mode = fitModeRef.current;
    const drawScaled = (el: CanvasImageSource, srcW: number, srcH: number) => {
      if (mode === 'stretch') {
        ctx.drawImage(el, 0, 0, cw, ch);
      } else {
        const aspect = srcW / srcH;
        let dw: number, dh: number;
        if (mode === 'fill') {
          dw = cw; dh = cw / aspect;
          if (dh < ch) { dh = ch; dw = ch * aspect; }
        } else {
          dw = cw; dh = cw / aspect;
          if (dh > ch) { dh = ch; dw = ch * aspect; }
        }
        const dx = (cw - dw) / 2;
        const dy = (ch - dh) / 2;
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, cw, ch);
        ctx.clip();
        ctx.drawImage(el, dx, dy, dw, dh);
        ctx.restore();
      }
    };

    for (const activeClip of activeClips) {
      if (activeClip.type === 'video') {
        const vid = hiddenVideoEls.current.get(activeClip.id);
        if (vid && vid.readyState >= 2) {
          drawScaled(vid, vid.videoWidth || cw, vid.videoHeight || ch);
        }
      } else {
        const img = imageEls.current.get(activeClip.id);
        if (img && img.complete) {
          drawScaled(img, img.naturalWidth || cw, img.naturalHeight || ch);
        }
      }
    }
  }, [clips]);

  // Keep drawFrameRef current on every render so event handlers see the latest version
  drawFrameRef.current = drawFrame;

  // ── Seek hidden video elements to match playhead ───────────────────────────

  const seekHiddenVideos = useCallback((sec: number) => {
    for (const clip of clips) {
      if (clip.type !== 'video') continue;
      const vid = hiddenVideoEls.current.get(clip.id);
      if (!vid) continue;
      const inClip = sec >= clip.timelineStart && sec < clip.timelineStart + clip.displayDuration;
      if (inClip) {
        const sourceTime = clip.trimStart + (sec - clip.timelineStart);
        if (Math.abs(vid.currentTime - sourceTime) > 0.1) {
          vid.currentTime = sourceTime;
        }
        // During playback, start the video element if it just came into range
        if (isPlayingRef.current && vid.paused) {
          vid.play().catch(() => {});
        }
      } else {
        if (!vid.paused) vid.pause();
      }
    }
  }, [clips]);

  // ── Seek audio elements to match playhead (used when paused) ──────────────

  const seekHiddenAudios = useCallback((sec: number) => {
    for (const clip of audioClips) {
      const aud = hiddenAudioEls.current.get(clip.id);
      if (!aud) continue;
      if (!aud.paused) aud.pause();
      const inClip = sec >= clip.timelineStart && sec < clip.timelineStart + clip.displayDuration;
      if (inClip) {
        const sourceTime = clip.trimStart + (sec - clip.timelineStart);
        aud.currentTime = sourceTime;
      }
    }
  }, [audioClips]);

  // ── Start / stop audio clips during active playback (no re-seek) ──────────

  const syncAudioPlayback = useCallback((sec: number) => {
    for (const clip of audioClips) {
      const aud = hiddenAudioEls.current.get(clip.id);
      if (!aud) continue;
      const inClip = sec >= clip.timelineStart && sec < clip.timelineStart + clip.displayDuration;
      if (inClip && aud.paused) {
        // Clip just entered playback range — seek to correct position and play
        const sourceTime = clip.trimStart + (sec - clip.timelineStart);
        aud.currentTime = sourceTime;
        aud.play().catch(() => {});
      } else if (!inClip && !aud.paused) {
        aud.pause();
      }
    }
  }, [audioClips]);

  // ── RAF loop ───────────────────────────────────────────────────────────────

  const rafLoop = useCallback(() => {
    if (!isPlayingRef.current) return;
    const elapsed = (performance.now() - playStartTimeRef.current) / 1000;
    const newPlayhead = Math.min(playStartPlayheadRef.current + elapsed, totalDuration);
    setPlayhead(newPlayhead);
    seekHiddenVideos(newPlayhead);
    syncAudioPlayback(newPlayhead);
    drawFrame(newPlayhead);
    if (newPlayhead >= totalDuration) {
      setIsPlaying(false);
      isPlayingRef.current = false;
      // Pause all audio on end
      for (const aud of hiddenAudioEls.current.values()) aud.pause();
      return;
    }
    rafRef.current = requestAnimationFrame(rafLoop);
  }, [totalDuration, seekHiddenVideos, syncAudioPlayback, drawFrame]);

  // Static redraw when paused
  useLayoutEffect(() => {
    if (!isPlaying) {
      seekHiddenVideos(playhead);
      seekHiddenAudios(playhead);
      // Give the video element a moment to seek before drawing
      setTimeout(() => drawFrame(playhead), 80);
    }
  }, [playhead, isPlaying, drawFrame, seekHiddenVideos, seekHiddenAudios]);

  // ── Play / Pause ───────────────────────────────────────────────────────────

  const handlePlayPause = useCallback(() => {
    if (isPlaying) {
      setIsPlaying(false);
      isPlayingRef.current = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      // Pause all hidden video elements
      for (const vid of hiddenVideoEls.current.values()) vid.pause();
      // Pause all hidden audio elements
      for (const aud of hiddenAudioEls.current.values()) aud.pause();
    } else {
      const startPh = playhead >= totalDuration ? 0 : playhead;
      if (playhead >= totalDuration) setPlayhead(0);
      setIsPlaying(true);
      isPlayingRef.current = true;
      playStartTimeRef.current = performance.now();
      playStartPlayheadRef.current = startPh;

      // Play video clips that are active at start position
      for (const clip of clips) {
        if (clip.type !== 'video') continue;
        const vid = hiddenVideoEls.current.get(clip.id);
        if (!vid) continue;
        const inClip = startPh >= clip.timelineStart && startPh < clip.timelineStart + clip.displayDuration;
        if (inClip) vid.play().catch(() => {});
      }

      // Seek & play audio clips that are active at start position
      for (const clip of audioClips) {
        const aud = hiddenAudioEls.current.get(clip.id);
        if (!aud) continue;
        const inClip = startPh >= clip.timelineStart && startPh < clip.timelineStart + clip.displayDuration;
        if (inClip) {
          aud.currentTime = clip.trimStart + (startPh - clip.timelineStart);
          aud.play().catch(() => {});
        }
      }

      rafRef.current = requestAnimationFrame(rafLoop);
    }
  }, [isPlaying, playhead, totalDuration, clips, audioClips, rafLoop]);

  // Keep handlePlayPauseRef current so keyboard shortcut handler always calls the latest version
  handlePlayPauseRef.current = handlePlayPause;

  // cleanup RAF on unmount + block page scroll
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      for (const vid of hiddenVideoEls.current.values()) vid.src = '';
      for (const aud of hiddenAudioEls.current.values()) { aud.pause(); aud.src = ''; }
    };
  }, []);

  // Native wheel on timeline: Ctrl+scroll=zoom, plain scroll=pan
  useEffect(() => {
    const el = timelineRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const isHorizontal = Math.abs(e.deltaX) > Math.abs(e.deltaY);
      if (isHorizontal) {
        // Trackpad horizontal swipe → pan
        el.scrollLeft += e.deltaX;
      } else if (e.ctrlKey || e.metaKey) {
        // Ctrl/Cmd + vertical scroll → zoom
        // Dynamic min: dezoom until all content is visible
        const containerWidth = el.offsetWidth;
        const dur = totalDurationRef.current;
        const minZoom = dur > 0 ? containerWidth / dur : 20;
        setZoomPxPerSec((z) => Math.max(minZoom, Math.min(400, z * (e.deltaY < 0 ? 1.15 : 0.87))));
      } else {
        // Plain vertical scroll → pan horizontally
        el.scrollLeft += e.deltaY;
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // Keyboard shortcuts: Space=play/pause, arrows=navigate, Home/End
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // Ignore when user is typing inside an input / textarea / select
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if (e.code === 'Space') {
        e.preventDefault();
        handlePlayPauseRef.current();
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        const step = e.shiftKey ? 5 : 0.1;
        setPlayhead((p) => Math.max(0, p - step));
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        const step = e.shiftKey ? 5 : 0.1;
        setPlayhead((p) => Math.min(totalDurationRef.current, p + step));
      } else if (e.code === 'Home') {
        e.preventDefault();
        setPlayhead(0);
      } else if (e.code === 'End') {
        e.preventDefault();
        setPlayhead(totalDurationRef.current);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // Redraw when output dimensions or fit mode change
  useEffect(() => {
    setTimeout(() => drawFrame(playhead), 20);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outW, outH, fitMode]);

  // ── Add media files ────────────────────────────────────────────────────────

  const addMediaFiles = useCallback(async (files: File[]) => {
    const valid = files.filter((f) => /^video\//i.test(f.type) || /^image\//i.test(f.type));
    if (!valid.length) return;

    const newClips: MediaClip[] = [];
    const track0Clips = clips.filter((c) => c.trackIndex === 0);
    let startSec = track0Clips.length > 0
      ? Math.max(...track0Clips.map((c) => c.timelineStart + c.displayDuration))
      : 0;

    for (const file of valid) {
      const isVideo = /^video\//i.test(file.type);
      const url = URL.createObjectURL(file);
      const duration = await getMediaDuration(url, isVideo);
      const { w, h } = isVideo ? { w: 1280, h: 720 } : await getImageSize(url);
      const dispDur = isVideo ? duration : 5;

      newClips.push({
        id: genId(),
        type: isVideo ? 'video' : 'image',
        file,
        name: file.name,
        objectUrl: url,
        timelineStart: startSec,
        displayDuration: dispDur,
        sourceDuration: duration,
        sourceWidth: w,
        sourceHeight: h,
        trimStart: 0,
        trimEnd: duration,
        muteVideoAudio: false,
        trackIndex: 0,
      });
      startSec += dispDur;
    }

    setClips((prev) => [...prev, ...newClips]);
    setOutputUrl(null);
  }, [clips]);

  // Consume pending files on mount
  useEffect(() => {
    const pending = consumePendingFiles();
    if (pending.length > 0) addMediaFiles(pending);
  }, [addMediaFiles]);

  // ── Add audio files ────────────────────────────────────────────────────────

  const addAudioFiles = useCallback(async (files: File[]) => {
    const valid = files.filter((f) => /^audio\//i.test(f.type));
    if (!valid.length) return;

    const newClips: AudioTrackClip[] = [];
    const track0Audio = audioClips.filter((a) => a.trackIndex === 0);
    let startSec = track0Audio.length > 0
      ? Math.max(...track0Audio.map((a) => a.timelineStart + a.displayDuration))
      : 0;

    for (const file of valid) {
      const url = URL.createObjectURL(file);
      const dur = await getMediaDuration(url, false);
      newClips.push({
        id: genId(),
        file,
        name: file.name,
        objectUrl: url,
        timelineStart: startSec,
        displayDuration: dur,
        sourceDuration: dur,
        trimStart: 0,
        trimEnd: dur,
        volume: 1,
        trackIndex: 0,
      });
      startSec += dur;
    }

    setAudioTrackCount((prev) => Math.max(prev, 1));
    setAudioClips((prev) => [...prev, ...newClips]);
    setOutputUrl(null);
  }, [audioClips]);

  // ── Drop handler ───────────────────────────────────────────────────────────

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingMedia(false);
    const files = Array.from(e.dataTransfer.files);
    const audioFiles = files.filter((f) => /^audio\//i.test(f.type));
    const mediaFiles = files.filter((f) => /^video\//i.test(f.type) || /^image\//i.test(f.type));
    if (mediaFiles.length) addMediaFiles(mediaFiles);
    if (audioFiles.length) addAudioFiles(audioFiles);
  }, [addMediaFiles, addAudioFiles]);

  // ── Remove clip ────────────────────────────────────────────────────────────

  const removeClip = useCallback((id: string) => {
    setClips((prev) => {
      const clip = prev.find((c) => c.id === id);
      if (clip) URL.revokeObjectURL(clip.objectUrl);
      return prev.filter((c) => c.id !== id);
    });
    if (selectedClipId === id) setSelectedClipId(null);
    setOutputUrl(null);
  }, [selectedClipId]);

  const removeAudioClip = useCallback((id: string) => {
    setAudioClips((prev) => {
      const clip = prev.find((c) => c.id === id);
      if (clip) URL.revokeObjectURL(clip.objectUrl);
      return prev.filter((c) => c.id !== id);
    });
    setOutputUrl(null);
  }, []);

  // ── Snap helper ────────────────────────────────────────────────────────────

  const snapToEdges = useCallback((
    sec: number,
    excludeId: string,
    allClips: MediaClip[],
    allAudio: AudioTrackClip[],
  ): number => {
    const edges: number[] = [0];
    for (const c of allClips) {
      if (c.id === excludeId) continue;
      edges.push(c.timelineStart, c.timelineStart + c.displayDuration);
    }
    for (const a of allAudio) {
      if (a.id === excludeId) continue;
      edges.push(a.timelineStart, a.timelineStart + a.displayDuration);
    }
    const snapThreshSec = SNAP_THRESHOLD_PX / zoomPxPerSec;
    for (const edge of edges) {
      if (Math.abs(sec - edge) < snapThreshSec) return edge;
    }
    return sec;
  }, [zoomPxPerSec]);

  // ── Timeline pointer events ────────────────────────────────────────────────

  const secFromX = useCallback((clientX: number): number => {
    const container = timelineRef.current;
    if (!container) return 0;
    const rect = container.getBoundingClientRect();
    const scrollLeft = container.scrollLeft;
    const x = clientX - rect.left + scrollLeft;
    return Math.max(0, x / zoomPxPerSec);
  }, [zoomPxPerSec]);

  // Returns which track lane a pointer Y position falls into
  const getTrackFromY = useCallback((clientY: number): { track: 'video' | 'audio'; trackIndex: number } | null => {
    const container = timelineRef.current;
    if (!container) return null;
    const rect = container.getBoundingClientRect();
    const y = clientY - rect.top;
    for (let i = 0; i < videoTrackCount; i++) {
      const top = RULER_H + i * (TRACK_H + 4);
      if (y >= top && y < top + TRACK_H) return { track: 'video', trackIndex: i };
    }
    const audioBase = RULER_H + videoTrackCount * (TRACK_H + 4) + SECTION_GAP;
    for (let j = 0; j < audioTrackCount; j++) {
      const top = audioBase + j * (TRACK_H + 4);
      if (y >= top && y < top + TRACK_H) return { track: 'audio', trackIndex: j };
    }
    return null;
  }, [videoTrackCount, audioTrackCount]);

  const handleTimelinePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    const clipEl = target.closest('[data-clip-id]') as HTMLElement | null;

    if (!clipEl) {
      // Click on ruler / empty area → move playhead
      dragRef.current = { kind: 'playhead' };
      const sec = secFromX(e.clientX);
      setPlayhead(sec);
      dragStartXRef.current = e.clientX;
      e.currentTarget.setPointerCapture(e.pointerId);
      return;
    }

    const clipId = clipEl.dataset.clipId!;
    const track = (clipEl.dataset.track ?? 'video') as 'video' | 'audio';
    const trackIndex = parseInt(clipEl.dataset.trackIndex ?? '0', 10);
    const handle = target.closest('[data-handle]')?.getAttribute('data-handle');

    if (handle === 'left') {
      dragRef.current = { kind: 'trimLeft', clipId, track };
      dragStartXRef.current = e.clientX;
      e.currentTarget.setPointerCapture(e.pointerId);
      return;
    }
    if (handle === 'right') {
      dragRef.current = { kind: 'trimRight', clipId, track };
      dragStartXRef.current = e.clientX;
      e.currentTarget.setPointerCapture(e.pointerId);
      return;
    }

    // Clip move
    const sec = secFromX(e.clientX);
    const clipStart = track === 'video'
      ? (clips.find((c) => c.id === clipId)?.timelineStart ?? 0)
      : (audioClips.find((a) => a.id === clipId)?.timelineStart ?? 0);
    dragRef.current = { kind: 'clipMove', clipId, track, trackIndex, offsetSec: sec - clipStart };
    dragStartXRef.current = e.clientX;
    dragStartValRef.current = clipStart;
    e.currentTarget.setPointerCapture(e.pointerId);
    if (track === 'video') setSelectedClipId(clipId);
  }, [secFromX, clips, audioClips]);

  const handleTimelinePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const mode = dragRef.current;
    if (mode.kind === 'none') return;

    if (mode.kind === 'playhead') {
      const sec = secFromX(e.clientX);
      setPlayhead(Math.max(0, sec));
      return;
    }

    const deltaPx = e.clientX - dragStartXRef.current;
    const deltaSec = deltaPx / zoomPxPerSec;

    if (mode.kind === 'clipMove') {
      const { clipId, track, offsetSec } = mode;
      const sec = secFromX(e.clientX);
      let newStart = Math.max(0, sec - offsetSec);
      const targetTrack = getTrackFromY(e.clientY);

      if (track === 'video') {
        setClips((prev) => {
          const clip = prev.find((c) => c.id === clipId);
          if (!clip) return prev;
          newStart = snapToEdges(newStart, clipId, prev, audioClips);
          const newTrackIndex = targetTrack?.track === 'video' ? targetTrack.trackIndex : clip.trackIndex;
          return prev.map((c) => c.id === clipId ? { ...c, timelineStart: newStart, trackIndex: newTrackIndex } : c);
        });
      } else {
        setAudioClips((prev) => {
          const clip = prev.find((a) => a.id === clipId);
          if (!clip) return prev;
          newStart = snapToEdges(newStart, clipId, clips, prev);
          const newTrackIndex = targetTrack?.track === 'audio' ? targetTrack.trackIndex : clip.trackIndex;
          return prev.map((a) => a.id === clipId ? { ...a, timelineStart: newStart, trackIndex: newTrackIndex } : a);
        });
      }
      return;
    }

    if (mode.kind === 'trimLeft') {
      const { clipId, track } = mode;
      if (track === 'video') {
        setClips((prev) => prev.map((c) => {
          if (c.id !== clipId) return c;
          const newTrimStart = Math.max(0, Math.min(c.trimStart + deltaSec, c.trimEnd - 0.1));
          const diff = newTrimStart - c.trimStart;
          return {
            ...c,
            trimStart: newTrimStart,
            timelineStart: c.timelineStart + diff,
            displayDuration: Math.max(0.1, c.displayDuration - diff),
          };
        }));
      } else {
        setAudioClips((prev) => prev.map((a) => {
          if (a.id !== clipId) return a;
          const newTrimStart = Math.max(0, Math.min(a.trimStart + deltaSec, a.trimEnd - 0.1));
          const diff = newTrimStart - a.trimStart;
          return {
            ...a,
            trimStart: newTrimStart,
            timelineStart: a.timelineStart + diff,
            displayDuration: Math.max(0.1, a.displayDuration - diff),
          };
        }));
      }
      dragStartXRef.current = e.clientX;
      return;
    }

    if (mode.kind === 'trimRight') {
      const { clipId, track } = mode;
      if (track === 'video') {
        setClips((prev) => prev.map((c) => {
          if (c.id !== clipId) return c;
          const newDisplayDur = Math.max(0.1, c.displayDuration + deltaSec);
          const newTrimEnd = Math.min(c.sourceDuration, c.trimStart + newDisplayDur);
          return {
            ...c,
            displayDuration: newTrimEnd - c.trimStart,
            trimEnd: newTrimEnd,
          };
        }));
      } else {
        setAudioClips((prev) => prev.map((a) => {
          if (a.id !== clipId) return a;
          const newDisplayDur = Math.max(0.1, a.displayDuration + deltaSec);
          const newTrimEnd = Math.min(a.sourceDuration, a.trimStart + newDisplayDur);
          return {
            ...a,
            displayDuration: newTrimEnd - a.trimStart,
            trimEnd: newTrimEnd,
          };
        }));
      }
      dragStartXRef.current = e.clientX;
      return;
    }
  }, [secFromX, zoomPxPerSec, clips, audioClips, snapToEdges, getTrackFromY]);

  const handleTimelinePointerUp = useCallback(() => {
    dragRef.current = { kind: 'none' };
    setOutputUrl(null);
  }, []);

  // ── Export ─────────────────────────────────────────────────────────────────

  const handleExport = async () => {
    if (clips.length === 0) return;
    setIsExporting(true);
    setExportProgress(0);
    setOutputUrl(null);

    // Declared outside try so finally can always clean them up
    const inputNames: string[] = [];
    const audioInputNames: string[] = [];

    try {
      if (!ffmpegRef.current) {
        ffmpegRef.current = new FFmpeg();
        await ffmpegRef.current.load({
          coreURL: 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm/ffmpeg-core.js',
          wasmURL: 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm/ffmpeg-core.wasm',
        });
      }

      const ff = ffmpegRef.current;
      ff.on('progress', ({ progress: p }) => setExportProgress(Math.round(p * 100)));

      // Delete any output left over from a previous failed export
      try { await ff.deleteFile('output.mp4'); } catch {}

      // Sort clips by timeline position
      const sortedClips = [...clips].sort((a, b) => a.timelineStart - b.timelineStart);
      const sortedAudio = [...audioClips].sort((a, b) => a.timelineStart - b.timelineStart);

      // Write all input files
      for (let i = 0; i < sortedClips.length; i++) {
        const clip = sortedClips[i];
        const ext = clip.file.name.split('.').pop() || (clip.type === 'video' ? 'mp4' : 'png');
        const name = `clip_${i}.${ext}`;
        await ff.writeFile(name, await fetchFile(clip.file));
        inputNames.push(name);
      }

      // Write audio inputs
      for (let i = 0; i < sortedAudio.length; i++) {
        const a = sortedAudio[i];
        const ext = a.file.name.split('.').pop() || 'mp3';
        const name = `audio_${i}.${ext}`;
        await ff.writeFile(name, await fetchFile(a.file));
        audioInputNames.push(name);
      }

      // Scale filter string based on fitMode
      const makeScaleFilter = (outLabel: string): string => {
        if (fitMode === 'stretch')
          return `scale=${outW}:${outH},setsar=1${outLabel}`;
        if (fitMode === 'fill')
          return `scale=${outW}:${outH}:force_original_aspect_ratio=increase,crop=${outW}:${outH}${outLabel}`;
        // fit (default)
        return `scale=${outW}:${outH}:force_original_aspect_ratio=decrease,pad=${outW}:${outH}:(ow-iw)/2:(oh-ih)/2,setsar=1${outLabel}`;
      };

      const hasAudioTrack = sortedAudio.length > 0;
      const hasOnlySimpleVideos = sortedClips.every((c) => c.type === 'video')
        && !hasAudioTrack
        && sortedClips.every((c) => !c.muteVideoAudio && c.trimStart === 0 && c.trimEnd === c.sourceDuration);

      // Build input args (with -loop 1 for images)
      const inputArgsWithLoop: string[] = [];
      for (let i = 0; i < sortedClips.length; i++) {
        if (sortedClips[i].type === 'image') {
          inputArgsWithLoop.push('-loop', '1', '-i', inputNames[i]);
        } else {
          inputArgsWithLoop.push('-i', inputNames[i]);
        }
      }
      for (const name of audioInputNames) inputArgsWithLoop.push('-i', name);

      // Build filter_complex. useVideoAudio=true tries to use [i:a] from video clips;
      // if that fails (clip has no audio stream), we retry with useVideoAudio=false.
      const buildFilter = (useVideoAudio: boolean): { fc: string; aLabel: string } => {
        const parts: string[] = [];
        const vLabels: string[] = [];
        const aLabels: string[] = [];

        for (let i = 0; i < sortedClips.length; i++) {
          const clip = sortedClips[i];
          const vLabel = `[v${i}]`;

          if (clip.type === 'image') {
            parts.push(
              `[${i}:v]` + makeScaleFilter('') +
              `,fps=30,format=yuv420p,trim=duration=${clip.displayDuration.toFixed(3)},setpts=PTS-STARTPTS${vLabel}`
            );
            parts.push(
              `aevalsrc=0:channel_layout=stereo:sample_rate=44100:duration=${clip.displayDuration.toFixed(3)}[a${i}]`
            );
          } else {
            parts.push(
              `[${i}:v]trim=start=${clip.trimStart.toFixed(3)}:end=${clip.trimEnd.toFixed(3)},` +
              `setpts=PTS-STARTPTS,` + makeScaleFilter('') + `,fps=30,format=yuv420p${vLabel}`
            );
            if (useVideoAudio && !clip.muteVideoAudio) {
              parts.push(
                `[${i}:a]atrim=start=${clip.trimStart.toFixed(3)}:end=${clip.trimEnd.toFixed(3)},asetpts=PTS-STARTPTS,aresample=44100[a${i}]`
              );
            } else {
              parts.push(
                `aevalsrc=0:channel_layout=stereo:sample_rate=44100:duration=${clip.displayDuration.toFixed(3)}[a${i}]`
              );
            }
          }
          vLabels.push(vLabel);
          aLabels.push(`[a${i}]`);
        }

        // concat expects inputs interleaved per segment: [v0][a0][v1][a1]...
        const interleavedLabels = vLabels.flatMap((v, i) => [v, aLabels[i]]).join('');
        parts.push(
          `${interleavedLabels}concat=n=${sortedClips.length}:v=1:a=1[outv_base][outa_base]`
        );

        let aLabel = '[outa_base]';
        if (hasAudioTrack) {
          const offset = sortedClips.length;
          const delayed: string[] = ['[outa_base]'];
          for (let i = 0; i < sortedAudio.length; i++) {
            const a = sortedAudio[i];
            const delayMs = Math.round(a.timelineStart * 1000);
            parts.push(
              `[${offset + i}:a]atrim=start=${a.trimStart.toFixed(3)}:end=${a.trimEnd.toFixed(3)},asetpts=PTS-STARTPTS,aresample=44100[at${i}]`
            );
            parts.push(`[at${i}]adelay=${delayMs}|${delayMs}[ad${i}]`);
            delayed.push(`[ad${i}]`);
          }
          parts.push(`${delayed.join('')}amix=inputs=${delayed.length}:duration=first[outa_mix]`);
          aLabel = '[outa_mix]';
        }

        return { fc: parts.join(';'), aLabel };
      };

      const outputArgs = ['-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '23', '-c:a', 'aac', '-b:a', '128k', '-shortest', 'output.mp4'];

      if (hasOnlySimpleVideos && sortedClips.length === 1) {
        // Single video, just copy
        await ff.exec(['-i', inputNames[0], '-c', 'copy', 'output.mp4']);
      } else {
        // First attempt: use video audio streams
        const { fc, aLabel } = buildFilter(true);
        try {
          await ff.exec([...inputArgsWithLoop, '-filter_complex', fc, '-map', '[outv_base]', '-map', aLabel, ...outputArgs]);
        } catch {
          // A video clip likely has no audio stream — retry with silence for all video clips
          try { await ff.deleteFile('output.mp4'); } catch {}
          const { fc: fcFallback, aLabel: aLabelFallback } = buildFilter(false);
          await ff.exec([...inputArgsWithLoop, '-filter_complex', fcFallback, '-map', '[outv_base]', '-map', aLabelFallback, ...outputArgs]);
        }
      }

      const data = await ff.readFile('output.mp4');
      const blob = new Blob([data as unknown as BlobPart], { type: 'video/mp4' });
      setOutputUrl(URL.createObjectURL(blob));

    } catch (err) {
      console.error('Export error:', err);
    } finally {
      setIsExporting(false);
      // Always clean up FS files, even if export failed
      if (ffmpegRef.current) {
        const ff = ffmpegRef.current;
        for (const name of inputNames) { try { await ff.deleteFile(name); } catch {} }
        for (const name of audioInputNames) { try { await ff.deleteFile(name); } catch {} }
        try { await ff.deleteFile('output.mp4'); } catch {}
      }
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  if (isMobile) {
    return (
      <div className="flex flex-col items-center justify-center text-center gap-4 py-16 px-6">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-500 to-violet-500 flex items-center justify-center">
          <Monitor className="w-8 h-8 text-white" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">{t('videoEditor.desktopOnly')}</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 max-w-xs">{t('videoEditor.desktopOnlyDesc')}</p>
        </div>
      </div>
    );
  }

  const timelineWidth = Math.max(800, totalDuration * zoomPxPerSec + 100);
  const hasClips = clips.length > 0 || audioClips.length > 0;
  // Height of the scrollable timeline area (ruler + all tracks)
  const TRACK_ROW = TRACK_H + 4;
  const timelineTracksHeight =
    RULER_H +
    videoTrackCount * TRACK_ROW +
    (audioTrackCount > 0 ? SECTION_GAP + audioTrackCount * TRACK_ROW : 0);

  // ── Hidden file inputs (always rendered) ───────────────────────────────────
  const fileInputs = (
    <>
      <input
        ref={mediaInputRef}
        type="file"
        className="hidden"
        multiple
        accept="video/*,image/*"
        onChange={(e) => { if (e.target.files) addMediaFiles(Array.from(e.target.files)); e.target.value = ''; }}
      />
      <input
        ref={audioInputRef}
        type="file"
        className="hidden"
        multiple
        accept="audio/*"
        onChange={(e) => { if (e.target.files) addAudioFiles(Array.from(e.target.files)); e.target.value = ''; }}
      />
    </>
  );

  return (
    <div className="flex-1 min-h-0 flex flex-col gap-3">

      {/* ── Main area: preview + sidebar ── */}
      <div className="flex gap-4 shrink-0">

        {/* ── Left: drop zone + preview ── */}
        <div className="flex flex-col flex-1 min-w-0 gap-3">

          {/* Import bar */}
          {clips.length === 0 && audioClips.length === 0 ? (
            /* Big drop zone when empty */
            <div
              className={`shrink-0 border-2 border-dashed rounded-2xl p-6 text-center transition-all ${
                isDraggingMedia
                  ? 'border-primary-500 bg-primary-50'
                  : 'border-gray-300 dark:border-gray-600 hover:border-primary-400 hover:bg-gray-50 dark:hover:bg-gray-800/50'
              }`}
              onDragOver={(e) => { e.preventDefault(); setIsDraggingMedia(true); }}
              onDragLeave={() => setIsDraggingMedia(false)}
              onDrop={handleDrop}
            >
              <Upload className="w-8 h-8 text-gray-400 mx-auto mb-3" />
              <p className="font-medium text-gray-700 dark:text-gray-300">{t('videoEditor.dropMedia')}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{t('videoEditor.formats')}</p>
              <div className="flex items-center justify-center gap-3 mt-4">
                <button
                  className="btn btn-secondary flex items-center gap-2 text-sm py-1.5"
                  onClick={() => mediaInputRef.current?.click()}
                >
                  <Film className="w-4 h-4" />
                  {t('videoEditor.addMediaBtn')}
                </button>
                <button
                  className="btn btn-secondary flex items-center gap-2 text-sm py-1.5"
                  onClick={() => audioInputRef.current?.click()}
                >
                  <Music className="w-4 h-4" />
                  {t('videoEditor.addAudioBtn')}
                </button>
              </div>
              {fileInputs}
            </div>
          ) : (
            /* Compact bar when clips exist */
            <div
              className={`shrink-0 flex items-center gap-2 px-3 py-2 rounded-xl border-2 border-dashed transition-all ${
                isDraggingMedia
                  ? 'border-primary-500 bg-primary-50'
                  : 'border-gray-200 dark:border-gray-600 hover:border-primary-300'
              }`}
              onDragOver={(e) => { e.preventDefault(); setIsDraggingMedia(true); }}
              onDragLeave={() => setIsDraggingMedia(false)}
              onDrop={handleDrop}
            >
              <Upload className="w-4 h-4 text-gray-400 shrink-0" />
              <span className="text-xs text-gray-500 dark:text-gray-400 flex-1">{t('videoEditor.dropMedia')}</span>
              <button
                className="btn btn-secondary flex items-center gap-1.5 text-xs py-1 px-2"
                onClick={() => mediaInputRef.current?.click()}
              >
                <Film className="w-3.5 h-3.5" />
                {t('videoEditor.addMediaBtn')}
              </button>
              <button
                className="btn btn-secondary flex items-center gap-1.5 text-xs py-1 px-2"
                onClick={() => audioInputRef.current?.click()}
              >
                <Music className="w-3.5 h-3.5" />
                {t('videoEditor.addAudioBtn')}
              </button>
              {fileInputs}
            </div>
          )}

          {/* Preview canvas */}
          {clips.length > 0 ? (
            <div className="card shrink-0 flex flex-col p-3 gap-2">
              <canvas
                ref={canvasRef}
                width={canvasW}
                height={canvasH}
                className="rounded-xl block mx-auto"
                style={{
                  backgroundColor: '#000',
                  width: 'auto',
                  height: 'auto',
                  maxWidth: '100%',
                  maxHeight: 'calc(100dvh - 420px)',
                  minHeight: 100,
                }}
              />
              {/* Controls */}
              <div className="flex items-center gap-3 shrink-0">
                <button
                  className="btn btn-secondary p-2 rounded-xl shrink-0"
                  onClick={handlePlayPause}
                >
                  {isPlaying
                    ? <Pause className="w-5 h-5" />
                    : <Play className="w-5 h-5" />}
                </button>
                <input
                  type="range"
                  min={0}
                  max={totalDuration}
                  step={0.05}
                  value={playhead}
                  className="flex-1 accent-primary-500"
                  onChange={(e) => {
                    const v = parseFloat(e.target.value);
                    setPlayhead(v);
                    if (isPlaying) {
                      playStartTimeRef.current = performance.now();
                      playStartPlayheadRef.current = v;
                    }
                  }}
                />
                <span className="text-xs text-gray-500 dark:text-gray-400 w-24 text-right shrink-0">
                  {formatSec(playhead)} / {formatSec(totalDuration)}
                </span>
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-400 dark:text-gray-500 py-4 text-center">{t('videoEditor.noClips')}</p>
          )}
        </div>

        {/* ── Right sidebar ── */}
        {hasClips && (
          <div className="w-72 shrink-0 flex flex-col gap-3 overflow-y-auto min-h-0">

            {/* Output format */}
            <div className="card shrink-0 space-y-2">
              <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">{t('videoEditor.outputFormat')}</h4>
              <div className="grid grid-cols-3 gap-1">
                {RATIO_PRESETS.map((p) => (
                  <button
                    key={p.id}
                    className={`text-xs py-1 px-1.5 rounded border transition-colors ${
                      ratioPreset === p.id
                        ? 'bg-primary-100 border-primary-400 text-primary-700 font-semibold'
                        : 'bg-white dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:border-primary-300'
                    }`}
                    onClick={() => { setRatioPreset(p.id); setOutW(p.w); setOutH(p.h); }}
                  >
                    {p.label}
                  </button>
                ))}
                <button
                  className={`text-xs py-1 px-1.5 rounded border transition-colors ${
                    ratioPreset === 'custom'
                      ? 'bg-primary-100 border-primary-400 text-primary-700 font-semibold'
                      : 'bg-white dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:border-primary-300'
                  }`}
                  onClick={() => setRatioPreset('custom')}
                >
                  {t('videoEditor.custom')}
                </button>
              </div>
              {ratioPreset === 'custom' && (
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    value={customW}
                    min={100}
                    max={7680}
                    className="w-full text-xs border border-gray-200 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded px-2 py-1 focus:outline-none focus:border-primary-400"
                    onChange={(e) => {
                      const v = Math.max(100, Math.min(7680, parseInt(e.target.value) || 1280));
                      setCustomW(v); setOutW(v);
                    }}
                  />
                  <span className="text-gray-400 dark:text-gray-500 text-xs shrink-0">×</span>
                  <input
                    type="number"
                    value={customH}
                    min={100}
                    max={7680}
                    className="w-full text-xs border border-gray-200 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded px-2 py-1 focus:outline-none focus:border-primary-400"
                    onChange={(e) => {
                      const v = Math.max(100, Math.min(7680, parseInt(e.target.value) || 720));
                      setCustomH(v); setOutH(v);
                    }}
                  />
                </div>
              )}
              <p className="text-[10px] text-gray-400 dark:text-gray-500">{outW} × {outH} px</p>

              {/* Fit mode */}
              <div className="pt-1 border-t border-gray-100 dark:border-gray-700 space-y-1.5">
                <p className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">{t('videoEditor.scaleMode')}</p>
                <div className="flex gap-1">
                  {([
                    { id: 'fit',     label: 'Fit',     descKey: 'videoEditor.fitDesc' as const },
                    { id: 'fill',    label: 'Fill',    descKey: 'videoEditor.fillDesc' as const },
                    { id: 'stretch', label: 'Stretch', descKey: 'videoEditor.stretchDesc' as const },
                  ] as const).map((m) => (
                    <button
                      key={m.id}
                      title={t(m.descKey)}
                      className={`flex-1 text-xs py-1 rounded border transition-colors ${
                        fitMode === m.id
                          ? 'bg-primary-100 border-primary-400 text-primary-700 font-semibold'
                          : 'bg-white dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:border-primary-300'
                      }`}
                      onClick={() => setFitMode(m.id)}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-gray-400 dark:text-gray-500">
                  {fitMode === 'fit' ? t('videoEditor.fitHint') :
                   fitMode === 'fill' ? t('videoEditor.fillHint') :
                   t('videoEditor.stretchHint')}
                </p>
              </div>
            </div>

            {/* Selected clip properties */}
            {selectedClip && (
              <div className="card space-y-3 shrink-0">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-gray-900 dark:text-gray-100 text-sm truncate">{selectedClip.name}</h3>
                  <button
                    className="text-xs text-red-500 hover:text-red-700 flex items-center gap-1 shrink-0"
                    onClick={() => removeClip(selectedClip.id)}
                  >
                    <X className="w-3 h-3" />
                    {t('videoEditor.removeClip')}
                  </button>
                </div>
                {selectedClip.type === 'video' && (
                  <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedClip.muteVideoAudio}
                      onChange={(e) => {
                        setClips((prev) => prev.map((c) =>
                          c.id === selectedClip.id ? { ...c, muteVideoAudio: e.target.checked } : c
                        ));
                        setOutputUrl(null);
                      }}
                      className="accent-primary-500"
                    />
                    {t('videoEditor.muteAudio')}
                  </label>
                )}
                <p className="text-xs text-gray-400 dark:text-gray-500">
                  {t('videoEditor.totalDuration')}: {formatSec(selectedClip.displayDuration)}
                </p>
              </div>
            )}

            {/* Audio clip properties */}
            {audioClips.map((a) => (
              <div key={a.id} className="card space-y-2 shrink-0">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <Volume2 className="w-4 h-4 text-green-600 shrink-0" />
                    <span className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{a.name}</span>
                  </div>
                  <button
                    className="text-xs text-red-500 hover:text-red-700 flex items-center gap-1 shrink-0 ml-2"
                    onClick={() => removeAudioClip(a.id)}
                  >
                    <X className="w-3 h-3" />
                    {t('videoEditor.removeClip')}
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500 dark:text-gray-400">{t('videoEditor.volume')}</span>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={a.volume}
                    className="flex-1 accent-primary-500"
                    onChange={(e) => {
                      const v = parseFloat(e.target.value);
                      setAudioClips((prev) => prev.map((ac) =>
                        ac.id === a.id ? { ...ac, volume: v } : ac
                      ));
                      setOutputUrl(null);
                    }}
                  />
                  <span className="text-xs text-gray-500 dark:text-gray-400 w-8 text-right">{Math.round(a.volume * 100)}%</span>
                </div>
              </div>
            ))}

            {/* Export */}
            {clips.length > 0 && (
              <div className="card shrink-0 space-y-3">
                <button
                  className="btn btn-primary w-full flex items-center justify-center gap-2"
                  onClick={handleExport}
                  disabled={isExporting}
                >
                  {isExporting ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      {t('videoEditor.exporting')} {exportProgress > 0 && `${exportProgress}%`}
                    </>
                  ) : (
                    <>
                      <Film className="w-4 h-4" />
                      {t('videoEditor.exportBtn')}
                    </>
                  )}
                </button>
                {isExporting && (
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary-500 transition-all duration-300"
                        style={{ width: `${exportProgress}%` }}
                      />
                    </div>
                    <span className="text-xs text-gray-500 dark:text-gray-400 w-8 text-right">{exportProgress}%</span>
                  </div>
                )}
              </div>
            )}

            {/* Export result */}
            {outputUrl && (
              <div className="card border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20 shrink-0 space-y-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div>
                    <p className="font-semibold text-green-900 dark:text-green-300 text-sm">{t('videoEditor.exportDone')}</p>
                    <p className="text-xs text-green-700 dark:text-green-400">{t('videoEditor.exportDoneDesc')}</p>
                  </div>
                  <a
                    href={outputUrl}
                    download="edited_video.mp4"
                    className="btn btn-primary flex items-center gap-2 text-sm py-1.5"
                  >
                    <Download className="w-4 h-4" />
                    {t('videoEditor.downloadResult')}
                  </a>
                </div>
                <video
                  src={outputUrl}
                  controls
                  className="w-full rounded-xl bg-black"
                  style={{ maxHeight: 160 }}
                />
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Timeline ── */}
      {hasClips && (
        <div className="card overflow-hidden p-0 flex-1 min-h-0 flex flex-col">

          {/* ── Toolbar: zoom + track remove ── */}
          <div className="flex items-center gap-2 px-3 py-1.5 border-b border-gray-100 dark:border-gray-700 shrink-0">
            <button className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400" onClick={() => setZoomPxPerSec((z) => Math.min(400, z * 1.25))} title={t('videoEditor.zoomIn')}><ZoomIn className="w-4 h-4" /></button>
            <button className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400" onClick={() => {
              const containerWidth = timelineRef.current?.offsetWidth ?? 800;
              const minZoom = totalDuration > 0 ? containerWidth / totalDuration : 20;
              setZoomPxPerSec((z) => Math.max(minZoom, z * 0.8));
            }} title={t('videoEditor.zoomOut')}><ZoomOut className="w-4 h-4" /></button>
            <div className="w-px h-4 bg-gray-200 dark:bg-gray-700 mx-1" />
            <span className="text-[10px] text-purple-400 font-medium">{videoTrackCount}V</span>
            <button
              className="flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded bg-gray-50 dark:bg-gray-700 hover:bg-red-50 dark:hover:bg-red-900/30 hover:text-red-600 dark:hover:text-red-400 hover:border-red-200 text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-600 disabled:opacity-30 transition-colors"
              onClick={() => setVideoTrackCount((n) => { const next = Math.max(n - 1, 1); setClips((prev) => prev.map((c) => c.trackIndex >= next ? { ...c, trackIndex: next - 1 } : c)); return next; })}
              disabled={videoTrackCount <= 1} title={t('videoEditor.removeVideoTrack')}
            ><Trash2 className="w-3 h-3" /> {t('videoEditor.trackV')}</button>
            <span className="text-[10px] text-green-500 font-medium ml-1">{audioTrackCount}A</span>
            <button
              className="flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded bg-gray-50 dark:bg-gray-700 hover:bg-red-50 dark:hover:bg-red-900/30 hover:text-red-600 dark:hover:text-red-400 hover:border-red-200 text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-600 disabled:opacity-30 transition-colors"
              onClick={() => setAudioTrackCount((n) => { const next = Math.max(n - 1, 0); setAudioClips((prev) => prev.map((a) => a.trackIndex >= next ? { ...a, trackIndex: Math.max(0, next - 1) } : a)); return next; })}
              disabled={audioTrackCount <= 0} title={t('videoEditor.removeAudioTrack')}
            ><Trash2 className="w-3 h-3" /> {t('videoEditor.trackA')}</button>
            <span className="text-xs text-gray-400 dark:text-gray-500 ml-auto">{t('videoEditor.snapHint')}</span>
          </div>

          {/* ── Body: fixed labels column + scrollable content ── */}
          <div className="flex flex-1 min-h-0 overflow-hidden">

            {/* Labels column (fixed, non-scrolling) */}
            <div className="shrink-0 flex flex-col border-r border-gray-200 bg-white overflow-hidden" style={{ width: LABEL_W }}>
              {/* Ruler placeholder */}
              <div className="shrink-0 bg-gray-50 border-b border-gray-200" style={{ height: RULER_H }} />

              {/* Video track labels */}
              {Array.from({ length: videoTrackCount }, (_, i) => (
                <div key={`vl${i}`} className="shrink-0 flex flex-col items-center justify-center border-b border-gray-100 bg-white" style={{ height: TRACK_H, marginTop: i > 0 ? 4 : 0 }}>
                  <Film className="w-2.5 h-2.5 text-purple-400" />
                  <span className="text-[9px] text-purple-500 font-bold mt-0.5 leading-none">V{i + 1}</span>
                </div>
              ))}
              {/* + Add video track */}
              <button
                className="shrink-0 flex items-center justify-center gap-0.5 text-purple-400 hover:text-purple-600 hover:bg-purple-50 border-b border-gray-100 transition-colors disabled:opacity-30"
                style={{ height: 22 }}
                onClick={() => setVideoTrackCount((n) => Math.min(n + 1, 6))}
                disabled={videoTrackCount >= 6}
                title={t('videoEditor.addVideoTrack')}
              >
                <span className="text-sm font-bold leading-none">+</span>
                <Film className="w-2.5 h-2.5" />
              </button>

              {/* Section separator */}
              {audioTrackCount > 0 && (
                <div className="shrink-0 bg-gray-100 border-y border-gray-200" style={{ height: SECTION_GAP, marginTop: 4 }} />
              )}

              {/* Audio track labels */}
              {Array.from({ length: audioTrackCount }, (_, j) => (
                <div key={`al${j}`} className="shrink-0 flex flex-col items-center justify-center border-b border-gray-100 bg-white" style={{ height: TRACK_H, marginTop: j > 0 ? 4 : 0 }}>
                  <Music className="w-2.5 h-2.5 text-green-500" />
                  <span className="text-[9px] text-green-600 font-bold mt-0.5 leading-none">A{j + 1}</span>
                </div>
              ))}
              {/* + Add audio track */}
              <button
                className="shrink-0 flex items-center justify-center gap-0.5 text-green-500 hover:text-green-700 hover:bg-green-50 border-b border-gray-100 transition-colors disabled:opacity-30"
                style={{ height: 22 }}
                onClick={() => { setAudioTrackCount((n) => Math.min(n + 1, 6)); }}
                disabled={audioTrackCount >= 6}
                title={t('videoEditor.addAudioTrack')}
              >
                <span className="text-sm font-bold leading-none">+</span>
                <Music className="w-2.5 h-2.5" />
              </button>
            </div>

            {/* Scrollable content */}
            <div
              ref={timelineRef}
              className="flex-1 overflow-x-auto overflow-y-hidden select-none [&::-webkit-scrollbar]:hidden"
              style={{ scrollbarWidth: 'none' }}
              onPointerDown={handleTimelinePointerDown}
              onPointerMove={handleTimelinePointerMove}
              onPointerUp={handleTimelinePointerUp}
            >
              <div style={{ width: timelineWidth, position: 'relative', minHeight: timelineTracksHeight, height: '100%' }}>

                {/* ── Ruler ── */}
                <div className="relative border-b border-gray-200 bg-gray-50" style={{ height: RULER_H }}>
                  {Array.from({ length: Math.ceil(totalDuration) + 1 }, (_, i) => (
                    <div key={i} style={{ position: 'absolute', left: i * zoomPxPerSec, top: 0, height: '100%' }} className="flex flex-col items-start">
                      <div className="w-px h-2 bg-gray-300" />
                      <span className="text-[9px] text-gray-400 ml-0.5 leading-none">{formatSec(i)}</span>
                    </div>
                  ))}
                  <div style={{ position: 'absolute', left: playhead * zoomPxPerSec, top: 0, width: 2, height: '100%', backgroundColor: '#7c3aed', pointerEvents: 'none' }} />
                </div>

                {/* ── Video tracks ── */}
                {Array.from({ length: videoTrackCount }, (_, i) => {
                  const trackClips = clips.filter((c) => c.trackIndex === i);
                  return (
                    <div key={`v${i}`} style={{ position: 'relative', height: TRACK_H, marginTop: i === 0 ? 0 : 4 }}>
                      <div style={{ position: 'absolute', left: playhead * zoomPxPerSec, top: 0, width: 2, height: '100%', backgroundColor: '#7c3aed', zIndex: 20, pointerEvents: 'none' }} />
                      {trackClips.map((clip) => {
                        const left = clip.timelineStart * zoomPxPerSec;
                        const width = Math.max(4, clip.displayDuration * zoomPxPerSec);
                        const isSelected = selectedClipId === clip.id;
                        return (
                          <div
                            key={clip.id}
                            data-clip-id={clip.id}
                            data-track="video"
                            data-track-index={i}
                            style={{ position: 'absolute', left, top: 2, width, height: TRACK_H - 4, cursor: 'grab' }}
                            className={`rounded-lg border-2 flex items-center overflow-hidden select-none ${
                              clip.type === 'video'
                                ? isSelected ? 'bg-purple-200 border-purple-500' : 'bg-purple-100 border-purple-300'
                                : isSelected ? 'bg-pink-200 border-pink-500' : 'bg-pink-100 border-pink-300'
                            }`}
                          >
                            <div data-handle="left" style={{ width: 8, minWidth: 8, height: '100%', cursor: 'ew-resize' }} className="bg-current opacity-30 flex-shrink-0" />
                            <span className="text-[10px] font-medium truncate px-1 flex-1 pointer-events-none">{clip.name}</span>
                            <div data-handle="right" style={{ width: 8, minWidth: 8, height: '100%', cursor: 'ew-resize' }} className="bg-current opacity-30 flex-shrink-0" />
                          </div>
                        );
                      })}
                    </div>
                  );
                })}

                {/* ── Section separator ── */}
                {audioTrackCount > 0 && (
                  <div style={{ height: SECTION_GAP, marginTop: 4 }} className="bg-gray-100 border-y border-gray-200" />
                )}

                {/* ── Audio tracks ── */}
                {Array.from({ length: audioTrackCount }, (_, j) => {
                  const trackAudioClips = audioClips.filter((a) => a.trackIndex === j);
                  return (
                    <div key={`a${j}`} style={{ position: 'relative', height: TRACK_H, marginTop: j === 0 ? 0 : 4 }}>
                      <div style={{ position: 'absolute', left: playhead * zoomPxPerSec, top: 0, width: 2, height: '100%', backgroundColor: '#7c3aed', zIndex: 20, pointerEvents: 'none' }} />
                      {trackAudioClips.map((clip) => {
                        const left = clip.timelineStart * zoomPxPerSec;
                        const width = Math.max(4, clip.displayDuration * zoomPxPerSec);
                        return (
                          <div
                            key={clip.id}
                            data-clip-id={clip.id}
                            data-track="audio"
                            data-track-index={j}
                            style={{ position: 'absolute', left, top: 2, width, height: TRACK_H - 4, cursor: 'grab' }}
                            className="rounded-lg border-2 bg-green-100 border-green-300 flex items-center overflow-hidden select-none"
                          >
                            <div data-handle="left" style={{ width: 8, minWidth: 8, height: '100%', cursor: 'ew-resize' }} className="bg-current opacity-30 flex-shrink-0" />
                            <span className="text-[10px] font-medium truncate px-1 flex-1 pointer-events-none">{clip.name}</span>
                            <div data-handle="right" style={{ width: 8, minWidth: 8, height: '100%', cursor: 'ew-resize' }} className="bg-current opacity-30 flex-shrink-0" />
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

import { createContext, useContext, useState, useEffect, useRef, useCallback, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";

export type Video = { id: string; title: string; artist: string };
export type Category = { id: string; name: string; emoji: string; query: string; fallback: Video[] };
export type SearchResult = { videoId: string; title: string; channel: string };

export const CATEGORIES: Category[] = [
  {
    id: "hits", name: "Top Hits", emoji: "🔥", query: "top hits 2024 official music video",
    fallback: [
      { id: "fHI8X4OXluQ", title: "Blinding Lights", artist: "The Weeknd" },
      { id: "JGwWNGJdvx8", title: "Shape of You", artist: "Ed Sheeran" },
      { id: "CvBfHwUxHIk", title: "Starboy", artist: "The Weeknd ft. Daft Punk" },
    ],
  },
  {
    id: "vibe", name: "Vibe", emoji: "🌊", query: "vibe trap rap 2024 official",
    fallback: [
      { id: "6ONRf7h3Mdk", title: "SICKO MODE", artist: "Travis Scott" },
      { id: "flq0dKSeqZ8", title: "Goosebumps", artist: "Travis Scott" },
      { id: "mgBF1bL1O_Q", title: "EARFQUAKE", artist: "Tyler the Creator" },
    ],
  },
  {
    id: "lofi", name: "Lo-Fi", emoji: "🎧", query: "lofi hip hop study music 2024",
    fallback: [
      { id: "jfKfPfyJRdk", title: "lofi hip hop radio", artist: "Lofi Girl" },
      { id: "5qap5aO4i9A", title: "beats to relax/study to", artist: "Lofi Girl" },
      { id: "DWcJFNfaw9c", title: "Chillhop Essentials", artist: "Chillhop Music" },
    ],
  },
  {
    id: "deepwork", name: "Deep Work", emoji: "⚡", query: "deep focus music concentration 2024",
    fallback: [
      { id: "QtlEHc5_xGI", title: "Deep Focus", artist: "Greenred Productions" },
      { id: "jJiMQP8VNCM", title: "Study Music Alpha Waves", artist: "YellowBrickCinema" },
      { id: "WPni755-Krg", title: "Focus Music for Work", artist: "Productivity Music" },
    ],
  },
  {
    id: "hiphop", name: "Hip Hop", emoji: "🎤", query: "hip hop rap 2024 official music video",
    fallback: [
      { id: "zhY_0DoQCQs", title: "God's Plan", artist: "Drake" },
      { id: "tvTRZJ-4EyI", title: "HUMBLE.", artist: "Kendrick Lamar" },
      { id: "C2TemF5bvJo", title: "Hotline Bling", artist: "Drake" },
    ],
  },
  {
    id: "edm", name: "EDM", emoji: "🎛️", query: "edm electronic dance music 2024 official",
    fallback: [
      { id: "gCYcHz2k5x0", title: "Clarity", artist: "Zedd ft. Foxes" },
      { id: "IcrbM1l_BoI", title: "Animals", artist: "Martin Garrix" },
      { id: "60ItHLz5WEA", title: "Wake Me Up", artist: "Avicii" },
    ],
  },
];

declare global {
  interface Window { YT: any; onYouTubeIframeAPIReady: () => void; }
}

interface MusicPlayerContextType {
  activeCategory: Category;
  tracks: Video[];
  trackIndex: number;
  playing: boolean;
  volume: number;
  muted: boolean;
  playerReady: boolean;
  hasEverPlayed: boolean;
  currentTrack: Video;
  currentTime: number;
  duration: number;
  loadingCategory: string | null;
  togglePlay: () => void;
  skipNext: () => void;
  skipPrev: () => void;
  changeVolume: (v: number) => void;
  toggleMute: () => void;
  switchCategory: (cat: Category) => void;
  jumpToTrack: (idx: number) => void;
  playSearchResult: (result: SearchResult) => void;
  stopAndReset: () => void;
  seekTo: (seconds: number) => void;
}

const MusicPlayerContext = createContext<MusicPlayerContextType | null>(null);

export function useMusicPlayer() {
  const ctx = useContext(MusicPlayerContext);
  if (!ctx) throw new Error("useMusicPlayer must be used within MusicPlayerProvider");
  return ctx;
}

async function fetchCategoryTracks(category: Category): Promise<Video[]> {
  try {
    const { data, error } = await supabase.functions.invoke('youtube-search', {
      body: { query: category.query },
    });
    if (error || !data?.results?.length) return category.fallback;
    return data.results.map((r: any) => ({
      id: r.videoId,
      title: (r.title || "").replace(/&#39;/g, "'").replace(/&amp;/g, "&").replace(/&quot;/g, '"'),
      artist: r.channelTitle || "",
    }));
  } catch {
    return category.fallback;
  }
}

export function MusicPlayerProvider({ children }: { children: ReactNode }) {
  const [activeCategory, setActiveCategory] = useState<Category>(CATEGORIES[0]);
  const [tracks, setTracks] = useState<Video[]>(CATEGORIES[0].fallback);
  const [trackIndex, setTrackIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [volume, setVolume] = useState(70);
  const [muted, setMuted] = useState(false);
  const [playerReady, setPlayerReady] = useState(false);
  const [hasEverPlayed, setHasEverPlayed] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [loadingCategory, setLoadingCategory] = useState<string | null>(null);

  const playerRef = useRef<any>(null);
  const playingRef = useRef(false);
  const tracksRef = useRef(tracks);
  const trackIndexRef = useRef(trackIndex);
  const activeCategoryRef = useRef(activeCategory);
  const fetchingMoreRef = useRef(false);

  useEffect(() => { playingRef.current = playing; }, [playing]);
  useEffect(() => { tracksRef.current = tracks; }, [tracks]);
  useEffect(() => { trackIndexRef.current = trackIndex; }, [trackIndex]);
  useEffect(() => { activeCategoryRef.current = activeCategory; }, [activeCategory]);
  useEffect(() => { if (playing) setHasEverPlayed(true); }, [playing]);

  // Initial fetch on mount
  useEffect(() => {
    setLoadingCategory(CATEGORIES[0].id);
    fetchCategoryTracks(CATEGORIES[0]).then(vids => {
      setTracks(vids);
      setLoadingCategory(null);
      const vid = vids[0]?.id;
      if (vid && playerRef.current && !playingRef.current && typeof playerRef.current.cueVideoById === 'function') {
        try { playerRef.current.cueVideoById(vid); } catch {}
      }
    });
  }, []);

  // Auto-fetch more tracks when queue runs low (last 2 tracks)
  useEffect(() => {
    if (tracks.length === 0) return;
    const remaining = tracks.length - trackIndex;
    if (remaining <= 2 && !fetchingMoreRef.current) {
      fetchingMoreRef.current = true;
      fetchCategoryTracks(activeCategory).then(newVids => {
        // Deduplicate by id
        setTracks(prev => {
          const existingIds = new Set(prev.map(v => v.id));
          const unique = newVids.filter(v => !existingIds.has(v.id));
          return unique.length > 0 ? [...prev, ...unique] : prev;
        });
        fetchingMoreRef.current = false;
      });
    }
  }, [trackIndex, tracks.length, activeCategory]);

  // Progress polling
  useEffect(() => {
    if (!playing || !playerRef.current) return;
    const id = setInterval(() => {
      try {
        setCurrentTime(playerRef.current?.getCurrentTime?.() ?? 0);
        setDuration(playerRef.current?.getDuration?.() ?? 0);
      } catch {}
    }, 1000);
    return () => clearInterval(id);
  }, [playing]);

  // Reset time on track change
  useEffect(() => { setCurrentTime(0); setDuration(0); }, [trackIndex]);

  // Logout listener
  useEffect(() => {
    const handler = () => {
      if (playerRef.current) { try { playerRef.current.stopVideo(); } catch {} }
      setPlaying(false);
      setTracks(CATEGORIES[0].fallback);
      setActiveCategory(CATEGORIES[0]);
      setTrackIndex(0);
      setHasEverPlayed(false);
      setCurrentTime(0);
      setDuration(0);
    };
    window.addEventListener('app-logout', handler);
    return () => window.removeEventListener('app-logout', handler);
  }, []);

  const currentTrack = tracks[trackIndex] || tracks[0] || CATEGORIES[0].fallback[0];

  const doSkipNext = useCallback(() => {
    const curTracks = tracksRef.current;
    const curIdx = trackIndexRef.current;
    if (curIdx + 1 < curTracks.length) {
      setTrackIndex(curIdx + 1);
    } else {
      // Move to next category
      const catIdx = CATEGORIES.findIndex(c => c.id === activeCategoryRef.current.id);
      const nextCat = CATEGORIES[(catIdx + 1) % CATEGORIES.length];
      setActiveCategory(nextCat);
      setLoadingCategory(nextCat.id);
      setTracks(nextCat.fallback);
      setTrackIndex(0);
      fetchCategoryTracks(nextCat).then(vids => {
        setTracks(vids);
        setLoadingCategory(null);
        const vid = vids[0]?.id;
        if (vid && playerRef.current && typeof playerRef.current.loadVideoById === 'function') {
          try { playerRef.current.loadVideoById(vid); } catch {}
        }
      });
    }
  }, []);

  // YouTube IFrame init
  useEffect(() => {
    if (!window.YT) {
      const tag = document.createElement("script");
      tag.src = "https://www.youtube.com/iframe_api";
      document.head.appendChild(tag);
    }
    const init = () => {
      if (playerRef.current) return;
      playerRef.current = new window.YT.Player("yt-player-global", {
        height: "1", width: "1",
        videoId: tracksRef.current[0]?.id || CATEGORIES[0].fallback[0].id,
        playerVars: { autoplay: 0, controls: 0 },
        events: {
          onReady: (e: any) => { setPlayerReady(true); e.target.setVolume(70); },
          onStateChange: (e: any) => {
            if (e.data === 1) setPlaying(true);
            if (e.data === 2) setPlaying(false);
            if (e.data === 0) doSkipNext();
          },
        },
      });
    };
    window.onYouTubeIframeAPIReady = init;
    if (window.YT?.Player) init();
  }, [doSkipNext]);

  // Load video on track/tracks change
  useEffect(() => {
    if (!playerReady || !playerRef.current) return;
    const vid = tracks[trackIndex]?.id;
    if (!vid) return;
    try {
      if (playingRef.current && typeof playerRef.current.loadVideoById === 'function') {
        playerRef.current.loadVideoById(vid);
      } else if (typeof playerRef.current.cueVideoById === 'function') {
        playerRef.current.cueVideoById(vid);
      }
    } catch {}
  }, [trackIndex, playerReady, tracks]);

  const togglePlay = useCallback(() => {
    if (!playerRef.current) return;
    if (playingRef.current) playerRef.current.pauseVideo();
    else playerRef.current.playVideo();
  }, []);

  const skipNext = useCallback(() => {
    doSkipNext();
    setTimeout(() => { if (playerRef.current && !playingRef.current) playerRef.current.playVideo(); }, 200);
  }, [doSkipNext]);

  const skipPrev = useCallback(() => {
    setTrackIndex(prev => (prev - 1 + tracksRef.current.length) % tracksRef.current.length);
  }, []);

  const changeVolume = useCallback((v: number) => {
    setVolume(v);
    if (playerRef.current) playerRef.current.setVolume(v);
    setMuted(v === 0);
  }, []);

  const toggleMute = useCallback(() => {
    setMuted(prev => {
      if (prev) {
        const v = volume || 70;
        if (playerRef.current) playerRef.current.setVolume(v);
        return false;
      } else {
        if (playerRef.current) playerRef.current.setVolume(0);
        return true;
      }
    });
  }, [volume]);

  const switchCategory = useCallback((cat: Category) => {
    if (cat.id === activeCategoryRef.current.id) return;
    setActiveCategory(cat);
    setLoadingCategory(cat.id);
    // Keep current track playing while fetching
    fetchCategoryTracks(cat).then(vids => {
      setTracks(vids);
      setTrackIndex(0);
      setLoadingCategory(null);
      if (playerRef.current) playerRef.current.loadVideoById(vids[0]?.id);
    });
  }, []);

  const jumpToTrack = useCallback((idx: number) => { setTrackIndex(idx); }, []);

  const playSearchResult = useCallback((result: SearchResult) => {
    const newVideo: Video = { id: result.videoId, title: result.title, artist: result.channel };
    const insertIdx = trackIndexRef.current + 1;
    setTracks(prev => {
      const copy = [...prev];
      copy.splice(insertIdx, 0, newVideo);
      return copy;
    });
    setTrackIndex(insertIdx);
    setTimeout(() => { playerRef.current?.loadVideoById(result.videoId); }, 100);
  }, []);

  const stopAndReset = useCallback(() => {
    if (playerRef.current) { try { playerRef.current.stopVideo(); } catch {} }
    setPlaying(false);
    setTracks(CATEGORIES[0].fallback);
    setActiveCategory(CATEGORIES[0]);
    setTrackIndex(0);
    setHasEverPlayed(false);
    setCurrentTime(0);
    setDuration(0);
  }, []);

  const seekTo = useCallback((seconds: number) => {
    if (playerRef.current) {
      playerRef.current.seekTo(seconds, true);
      setCurrentTime(seconds);
    }
  }, []);

  return (
    <MusicPlayerContext.Provider value={{
      activeCategory, tracks, trackIndex, playing, volume, muted, playerReady, hasEverPlayed, currentTrack,
      currentTime, duration, loadingCategory,
      togglePlay, skipNext, skipPrev, changeVolume, toggleMute, switchCategory, jumpToTrack, playSearchResult, stopAndReset, seekTo,
    }}>
      <div id="yt-player-global" style={{ position: 'fixed', top: '-9999px', left: '-9999px', width: '1px', height: '1px', opacity: 0, pointerEvents: 'none' }} />
      {children}
    </MusicPlayerContext.Provider>
  );
}

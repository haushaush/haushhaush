import { createContext, useContext, useState, useEffect, useRef, useCallback, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";

export type Video = { id: string; title: string; artist: string };
export type Playlist = { id: string; name: string; emoji: string; videos: Video[] };
export type SearchResult = { videoId: string; title: string; channel: string };

export const PLAYLISTS: Playlist[] = [
  {
    id: "hits", name: "Top Hits", emoji: "🔥",
    videos: [
      { id: "fHI8X4OXluQ", title: "Blinding Lights", artist: "The Weeknd" },
      { id: "JGwWNGJdvx8", title: "Shape of You", artist: "Ed Sheeran" },
      { id: "CvBfHwUxHIk", title: "Starboy", artist: "The Weeknd ft. Daft Punk" },
      { id: "DkeiKbqa02g", title: "Levitating", artist: "Dua Lipa" },
      { id: "H5v3kku4y6Q", title: "As It Was", artist: "Harry Styles" },
    ]
  },
  {
    id: "vibe", name: "Vibe", emoji: "🌊",
    videos: [
      { id: "6ONRf7h3Mdk", title: "SICKO MODE", artist: "Travis Scott" },
      { id: "flq0dKSeqZ8", title: "Goosebumps", artist: "Travis Scott" },
      { id: "mgBF1bL1O_Q", title: "EARFQUAKE", artist: "Tyler the Creator" },
      { id: "ZbZSe6N_BXs", title: "Happy", artist: "Pharrell Williams" },
      { id: "kffacxfA7G4", title: "Bad Guy", artist: "Billie Eilish" },
    ]
  },
  {
    id: "lofi", name: "Lo-Fi", emoji: "🎧",
    videos: [
      { id: "jfKfPfyJRdk", title: "lofi hip hop radio", artist: "Lofi Girl" },
      { id: "5qap5aO4i9A", title: "beats to relax/study to", artist: "Lofi Girl" },
      { id: "DWcJFNfaw9c", title: "Chillhop Essentials", artist: "Chillhop Music" },
    ]
  },
  {
    id: "deepwork", name: "Deep Work", emoji: "⚡",
    videos: [
      { id: "QtlEHc5_xGI", title: "Deep Focus", artist: "Greenred Productions" },
      { id: "jJiMQP8VNCM", title: "Study Music Alpha Waves", artist: "YellowBrickCinema" },
      { id: "WPni755-Krg", title: "Focus Music for Work", artist: "Productivity Music" },
    ]
  },
  {
    id: "hiphop", name: "Hip Hop", emoji: "🎤",
    videos: [
      { id: "zhY_0DoQCQs", title: "God's Plan", artist: "Drake" },
      { id: "tvTRZJ-4EyI", title: "HUMBLE.", artist: "Kendrick Lamar" },
      { id: "C2TemF5bvJo", title: "Hotline Bling", artist: "Drake" },
      { id: "09R8_2nJtjg", title: "Sugar", artist: "BROCKHAMPTON" },
    ]
  },
  {
    id: "edm", name: "EDM", emoji: "🎛️",
    videos: [
      { id: "gCYcHz2k5x0", title: "Clarity", artist: "Zedd ft. Foxes" },
      { id: "IcrbM1l_BoI", title: "Animals", artist: "Martin Garrix" },
      { id: "60ItHLz5WEA", title: "Wake Me Up", artist: "Avicii" },
    ]
  },
];

declare global {
  interface Window { YT: any; onYouTubeIframeAPIReady: () => void; }
}

interface MusicPlayerContextType {
  activePlaylist: Playlist;
  trackIndex: number;
  playing: boolean;
  volume: number;
  muted: boolean;
  playerReady: boolean;
  hasEverPlayed: boolean;
  currentTrack: Video;
  togglePlay: () => void;
  skipNext: () => void;
  skipPrev: () => void;
  changeVolume: (v: number) => void;
  toggleMute: () => void;
  switchPlaylist: (pl: Playlist) => void;
  jumpToTrack: (idx: number) => void;
  jumpToAbsolute: (playlistIndex: number, trackIdx: number) => void;
  playSearchResult: (result: SearchResult) => void;
  stopAndReset: () => void;
}

const MusicPlayerContext = createContext<MusicPlayerContextType | null>(null);

export function useMusicPlayer() {
  const ctx = useContext(MusicPlayerContext);
  if (!ctx) throw new Error("useMusicPlayer must be used within MusicPlayerProvider");
  return ctx;
}

export function MusicPlayerProvider({ children }: { children: ReactNode }) {
  const [activePlaylist, setActivePlaylist] = useState<Playlist>(PLAYLISTS[0]);
  const [trackIndex, setTrackIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [volume, setVolume] = useState(70);
  const [muted, setMuted] = useState(false);
  const [playerReady, setPlayerReady] = useState(false);
  const [hasEverPlayed, setHasEverPlayed] = useState(false);
  const playerRef = useRef<any>(null);
  const playingRef = useRef(false);
  const activePlaylistRef = useRef(activePlaylist);
  const trackIndexRef = useRef(trackIndex);

  useEffect(() => { playingRef.current = playing; }, [playing]);
  useEffect(() => { activePlaylistRef.current = activePlaylist; }, [activePlaylist]);
  useEffect(() => { trackIndexRef.current = trackIndex; }, [trackIndex]);
  useEffect(() => { if (playing) setHasEverPlayed(true); }, [playing]);

  // Listen for logout event to stop playback
  useEffect(() => {
    const handler = () => {
      if (playerRef.current) { try { playerRef.current.stopVideo(); } catch {} }
      setPlaying(false);
      setActivePlaylist(PLAYLISTS[0]);
      setTrackIndex(0);
      setHasEverPlayed(false);
    };
    window.addEventListener('app-logout', handler);
    return () => window.removeEventListener('app-logout', handler);
  }, []);

  const currentTrack = activePlaylist.videos[trackIndex] || activePlaylist.videos[0];

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
        videoId: PLAYLISTS[0].videos[0].id,
        playerVars: { autoplay: 0, controls: 0 },
        events: {
          onReady: (e: any) => { setPlayerReady(true); e.target.setVolume(70); },
          onStateChange: (e: any) => {
            if (e.data === 1) setPlaying(true);
            if (e.data === 2) setPlaying(false);
            if (e.data === 0) {
              setTrackIndex(prev => (prev + 1) % activePlaylistRef.current.videos.length);
            }
          }
        }
      });
    };
    window.onYouTubeIframeAPIReady = init;
    if (window.YT?.Player) init();
  }, []);

  useEffect(() => {
    if (!playerReady || !playerRef.current) return;
    const vid = activePlaylist.videos[trackIndex]?.id;
    if (!vid) return;
    if (playingRef.current) playerRef.current.loadVideoById(vid);
    else playerRef.current.cueVideoById(vid);
  }, [trackIndex, playerReady, activePlaylist]);

  const togglePlay = useCallback(() => {
    if (!playerRef.current) return;
    if (playingRef.current) playerRef.current.pauseVideo();
    else playerRef.current.playVideo();
  }, []);

  const skipNext = useCallback(() => {
    setTrackIndex(prev => (prev + 1) % activePlaylistRef.current.videos.length);
  }, []);

  const skipPrev = useCallback(() => {
    setTrackIndex(prev => (prev - 1 + activePlaylistRef.current.videos.length) % activePlaylistRef.current.videos.length);
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

  const switchPlaylist = useCallback((pl: Playlist) => {
    setActivePlaylist(pl);
    setTrackIndex(0);
    setPlaying(false);
    if (playerRef.current) playerRef.current.cueVideoById(pl.videos[0].id);
  }, []);

  const jumpToTrack = useCallback((idx: number) => { setTrackIndex(idx); }, []);

  const playSearchResult = useCallback((result: SearchResult) => {
    const newVideo: Video = { id: result.videoId, title: result.title, artist: result.channel };
    setActivePlaylist(prev => {
      const newVideos = [...prev.videos];
      const insertIdx = trackIndex + 1;
      newVideos.splice(insertIdx, 0, newVideo);
      return { ...prev, videos: newVideos };
    });
    const insertIdx = trackIndex + 1;
    setTrackIndex(insertIdx);
    setTimeout(() => { playerRef.current?.loadVideoById(result.videoId); }, 100);
  }, [trackIndex]);

  const stopAndReset = useCallback(() => {
    if (playerRef.current) {
      try { playerRef.current.stopVideo(); } catch { }
    }
    setPlaying(false);
    setActivePlaylist(PLAYLISTS[0]);
    setTrackIndex(0);
    setHasEverPlayed(false);
  }, []);

  return (
    <MusicPlayerContext.Provider value={{
      activePlaylist, trackIndex, playing, volume, muted, playerReady, hasEverPlayed, currentTrack,
      togglePlay, skipNext, skipPrev, changeVolume, toggleMute, switchPlaylist, jumpToTrack, playSearchResult, stopAndReset,
    }}>
      <div id="yt-player-global" style={{ position: 'fixed', top: '-9999px', left: '-9999px', width: '1px', height: '1px', opacity: 0, pointerEvents: 'none' }} />
      {children}
    </MusicPlayerContext.Provider>
  );
}

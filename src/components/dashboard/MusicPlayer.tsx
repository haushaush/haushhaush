import { useState, useEffect, useRef, useCallback } from "react";
import { Play, Pause, SkipForward, SkipBack, Volume2, VolumeX, ChevronDown, ChevronUp, Music, Search, Loader2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const PLAYLISTS = [
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

type SearchResult = { videoId: string; title: string; channel: string };

declare global {
  interface Window { YT: any; onYouTubeIframeAPIReady: () => void; }
}

export default function MusicPlayer() {
  const [expanded, setExpanded] = useState(false);
  const [activePlaylist, setActivePlaylist] = useState(PLAYLISTS[0]);
  const [trackIndex, setTrackIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [volume, setVolume] = useState(70);
  const [muted, setMuted] = useState(false);
  const [playerReady, setPlayerReady] = useState(false);
  const [thumbError, setThumbError] = useState(false);
  const playerRef = useRef<any>(null);
  const playingRef = useRef(false);

  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");

  const currentTrack = activePlaylist.videos[trackIndex];
  const thumbUrl = `https://img.youtube.com/vi/${currentTrack.id}/hqdefault.jpg`;

  useEffect(() => { playingRef.current = playing; }, [playing]);
  useEffect(() => { setThumbError(false); }, [currentTrack.id, activePlaylist.id]);

  const skipNext = useCallback(() => {
    setTrackIndex(prev => (prev + 1) % activePlaylist.videos.length);
  }, [activePlaylist.videos.length]);

  const skipPrev = useCallback(() => {
    setTrackIndex(prev => (prev - 1 + activePlaylist.videos.length) % activePlaylist.videos.length);
  }, [activePlaylist.videos.length]);

  useEffect(() => {
    if (!window.YT) {
      const tag = document.createElement("script");
      tag.src = "https://www.youtube.com/iframe_api";
      document.head.appendChild(tag);
    }
    const init = () => {
      if (playerRef.current) return;
      playerRef.current = new window.YT.Player("yt-player-hidden", {
        height: "1", width: "1",
        videoId: activePlaylist.videos[0].id,
        playerVars: { autoplay: 0, controls: 0 },
        events: {
          onReady: (e: any) => { setPlayerReady(true); e.target.setVolume(70); },
          onStateChange: (e: any) => {
            if (e.data === 1) setPlaying(true);
            if (e.data === 2) setPlaying(false);
            if (e.data === 0) setTrackIndex(prev => (prev + 1) % activePlaylist.videos.length);
          }
        }
      });
    };
    window.onYouTubeIframeAPIReady = init;
    if (window.YT?.Player) init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!playerReady || !playerRef.current) return;
    const vid = activePlaylist.videos[trackIndex]?.id;
    if (!vid) return;
    if (playingRef.current) playerRef.current.loadVideoById(vid);
    else playerRef.current.cueVideoById(vid);
  }, [trackIndex, playerReady, activePlaylist]);

  const togglePlay = () => {
    if (!playerRef.current) return;
    if (playing) playerRef.current.pauseVideo();
    else playerRef.current.playVideo();
  };

  const changeVolume = (v: number) => {
    setVolume(v);
    if (playerRef.current) playerRef.current.setVolume(v);
    setMuted(v === 0);
  };

  const toggleMute = () => {
    if (muted) { changeVolume(volume || 70); setMuted(false); }
    else { playerRef.current?.setVolume(0); setMuted(true); }
  };

  const switchPlaylist = (pl: typeof PLAYLISTS[0]) => {
    setActivePlaylist(pl);
    setTrackIndex(0);
    setPlaying(false);
    if (playerRef.current) playerRef.current.cueVideoById(pl.videos[0].id);
  };

  const jumpToTrack = (absoluteIndex: number) => { setTrackIndex(absoluteIndex); };

  // --- YouTube Search via edge function ---
  const doSearch = async () => {
    const q = searchQuery.trim();
    if (!q) return;
    setSearching(true);
    setSearchError("");
    setSearchResults([]);
    try {
      const { data, error } = await supabase.functions.invoke('youtube-search', { body: { query: q } });
      if (error) { setSearchError("Suche fehlgeschlagen"); return; }
      const items: SearchResult[] = (data.results || []).map((r: any) => ({
        videoId: r.videoId,
        title: r.title,
        channel: r.channelTitle,
      }));
      setSearchResults(items);
      if (items.length === 0) setSearchError("Keine Ergebnisse");
    } catch { setSearchError("Netzwerkfehler"); } finally { setSearching(false); }
  };

  const playSearchResult = (result: SearchResult) => {
    const newVideo = { id: result.videoId, title: result.title, artist: result.channel };
    const newVideos = [...activePlaylist.videos];
    const insertIdx = trackIndex + 1;
    newVideos.splice(insertIdx, 0, newVideo);
    setActivePlaylist({ ...activePlaylist, videos: newVideos });
    setTrackIndex(insertIdx);
    setSearchResults([]);
    setSearchQuery("");
    setTimeout(() => { playerRef.current?.loadVideoById(result.videoId); }, 100);
  };

  // Build upcoming queue
  const upcomingQueue: Array<{ id: string; title: string; artist: string; _idx: number }> = [];
  const vids = activePlaylist.videos;
  const queueSize = Math.min(5, vids.length);
  for (let i = 0; i < queueSize; i++) {
    const idx = (trackIndex + i) % vids.length;
    upcomingQueue.push({ ...vids[idx], _idx: idx });
  }

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <div id="yt-player-hidden" style={{ position: 'fixed', top: '-9999px', left: '-9999px', width: '1px', height: '1px', opacity: 0, pointerEvents: 'none' }} />

      {/* Collapsed bar */}
      <div
        className="flex items-center gap-3 p-3 cursor-pointer hover:bg-muted/30 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="w-10 h-10 rounded-lg flex-shrink-0 overflow-hidden">
          {!thumbError ? (
            <img src={thumbUrl} alt={currentTrack.title} className="w-full h-full object-cover rounded-lg" onError={() => setThumbError(true)} />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-teal-500 to-cyan-600 rounded-lg" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{currentTrack.title}</p>
          <p className="text-xs text-muted-foreground truncate">{currentTrack.artist}</p>
        </div>
        <button onClick={e => { e.stopPropagation(); skipPrev(); }} className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
          <SkipBack className="h-4 w-4" />
        </button>
        <button onClick={e => { e.stopPropagation(); togglePlay(); }} className="w-8 h-8 rounded-full bg-foreground flex items-center justify-center text-background shadow-md">
          {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5 ml-0.5" />}
        </button>
        <button onClick={e => { e.stopPropagation(); skipNext(); }} className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
          <SkipForward className="h-4 w-4" />
        </button>
        {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground ml-1" /> : <ChevronDown className="h-4 w-4 text-muted-foreground ml-1" />}
      </div>

      {/* Expanded panel */}
      {expanded && (
        <div className="border-t border-border p-4 space-y-4">
          {/* Volume */}
          <div className="flex items-center gap-3">
            <button onClick={toggleMute} className="text-muted-foreground hover:text-foreground transition-colors">
              {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            </button>
            <input type="range" min={0} max={100} value={muted ? 0 : volume} onChange={e => changeVolume(Number(e.target.value))} className="flex-1 h-1.5 rounded-full accent-primary cursor-pointer" />
            <span className="text-xs text-muted-foreground w-7 text-right">{muted ? 0 : volume}%</span>
          </div>

          {/* Category pills */}
          <div className="flex gap-1.5 overflow-x-auto scrollbar-none">
            {PLAYLISTS.map(pl => (
              <button
                key={pl.id}
                onClick={() => switchPlaylist(pl)}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-all border ${
                  activePlaylist.id === pl.id
                    ? 'bg-muted border-border text-foreground'
                    : 'bg-transparent border-border/50 text-muted-foreground hover:border-border hover:text-foreground'
                }`}
              >
                <span>{pl.emoji}</span>
                <span>{pl.name}</span>
              </button>
            ))}
          </div>

          {/* YouTube Search */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="flex-1 flex items-center gap-2 rounded-lg border border-border bg-background px-2.5 py-1.5">
                <Search className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && doSearch()}
                  placeholder="Song suchen…"
                  className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/60"
                  onClick={e => e.stopPropagation()}
                />
                {searchQuery && (
                  <button onClick={() => { setSearchQuery(""); setSearchResults([]); }} className="text-muted-foreground hover:text-foreground">
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              <button
                onClick={doSearch}
                disabled={searching || !searchQuery.trim()}
                className="px-3 py-1.5 rounded-lg bg-foreground text-background text-xs font-medium disabled:opacity-40 hover:opacity-90 transition-opacity"
              >
                {searching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Suchen"}
              </button>
            </div>


            {searchError && <p className="text-xs text-destructive">{searchError}</p>}

            {searchResults.length > 0 && (
              <div className="space-y-0.5 max-h-48 overflow-y-auto">
                {searchResults.map(r => (
                  <button
                    key={r.videoId}
                    onClick={() => playSearchResult(r)}
                    className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left hover:bg-muted transition-colors"
                  >
                    <div className="w-8 h-8 rounded overflow-hidden flex-shrink-0">
                      <img src={`https://img.youtube.com/vi/${r.videoId}/default.jpg`} alt="" className="w-full h-full object-cover" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm truncate">{r.title}</p>
                      <p className="text-[11px] text-muted-foreground truncate">{r.channel}</p>
                    </div>
                    <Play className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Queue */}
          <div className="space-y-0.5">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Queue</p>
            {upcomingQueue.map((v) => (
              <button
                key={`${v.id}-${v._idx}`}
                onClick={() => jumpToTrack(v._idx)}
                className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left transition-colors ${
                  v._idx === trackIndex ? 'bg-primary/10 text-primary' : 'hover:bg-muted text-foreground'
                }`}
              >
                {v._idx === trackIndex && playing ? (
                  <div className="flex items-center gap-[2px] h-3.5 w-3.5 flex-shrink-0">
                    <span className="w-[3px] h-2 bg-primary rounded-full animate-pulse" />
                    <span className="w-[3px] h-3 bg-primary rounded-full animate-pulse" style={{ animationDelay: '150ms' }} />
                    <span className="w-[3px] h-2 bg-primary rounded-full animate-pulse" style={{ animationDelay: '300ms' }} />
                  </div>
                ) : (
                  <Music className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
                )}
                <span className="text-sm truncate">{v.title}</span>
                <span className="text-xs text-muted-foreground ml-auto flex-shrink-0">{v.artist}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

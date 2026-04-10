import { useState, useEffect, useRef } from "react";
import { Play, Pause, SkipForward, SkipBack, Volume2, VolumeX, ChevronDown, ChevronUp, Music } from "lucide-react";

const PLAYLISTS = [
  {
    id: "hits",
    name: "Top Hits",
    emoji: "🔥",
    color: "from-rose-500 to-pink-600",
    videos: [
      { id: "4NRXx6U8BzM", title: "Blinding Lights", artist: "The Weeknd" },
      { id: "JGwWNGJdvx8", title: "Shape of You", artist: "Ed Sheeran" },
      { id: "kTJczUoc26U", title: "Starboy", artist: "The Weeknd ft. Daft Punk" },
      { id: "SlPhMPnQ58k", title: "Levitating", artist: "Dua Lipa" },
      { id: "h--P8HzYZ_4", title: "As It Was", artist: "Harry Styles" },
    ]
  },
  {
    id: "vibe",
    name: "Vibe / Trap",
    emoji: "🌊",
    color: "from-violet-500 to-purple-700",
    videos: [
      { id: "S-kBwIgvFSQ", title: "SICKO MODE", artist: "Travis Scott" },
      { id: "I4DjHHVHWAE", title: "Dark Knight Dummo", artist: "Trippie Redd" },
      { id: "flq0dKSeqZ8", title: "Goosebumps", artist: "Travis Scott" },
      { id: "mgBF1bL1O_Q", title: "EARFQUAKE", artist: "Tyler the Creator" },
      { id: "1l7qcQz2jxY", title: "Nights", artist: "Frank Ocean" },
    ]
  },
  {
    id: "lofi",
    name: "Lo-Fi Focus",
    emoji: "🎧",
    color: "from-teal-500 to-cyan-600",
    videos: [
      { id: "jfKfPfyJRdk", title: "lofi hip hop radio", artist: "Lofi Girl" },
      { id: "5qap5aO4i9A", title: "beats to relax/study to", artist: "Lofi Girl" },
      { id: "DWcJFNfaw9c", title: "Chillhop Essentials", artist: "Chillhop Music" },
    ]
  },
  {
    id: "deepwork",
    name: "Deep Work",
    emoji: "⚡",
    color: "from-orange-500 to-amber-600",
    videos: [
      { id: "QtlEHc5_xGI", title: "Deep Focus - Music For Coding", artist: "Greenred Productions" },
      { id: "jJiMQP8VNCM", title: "Study Music Alpha Waves", artist: "YellowBrickCinema" },
      { id: "WPni755-Krg", title: "Focus Music for Work", artist: "Productivity Music" },
    ]
  },
  {
    id: "hiphop",
    name: "Hip Hop",
    emoji: "🎤",
    color: "from-yellow-500 to-orange-500",
    videos: [
      { id: "w-Zl2yiR9mQ", title: "God's Plan", artist: "Drake" },
      { id: "RGaGZDlKHlA", title: "HUMBLE.", artist: "Kendrick Lamar" },
      { id: "ZAEROei7T80", title: "Money Longer", artist: "Lil Uzi Vert" },
      { id: "7wtfhZwyrcc", title: "XO Tour Llif3", artist: "Lil Uzi Vert" },
    ]
  },
  {
    id: "techno",
    name: "Techno / EDM",
    emoji: "🎛️",
    color: "from-cyan-500 to-blue-600",
    videos: [
      { id: "h_D3VFfhvs4", title: "Progressive House Mix", artist: "The Anjunafamily" },
      { id: "rgnM09h8lPQ", title: "Electronic Music Mix", artist: "Proximity" },
      { id: "4m1EFMoRFvY", title: "Techno Mix 2024", artist: "Techno Select" },
    ]
  },
];

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
  const containerRef = useRef<HTMLDivElement>(null);

  const currentTrack = activePlaylist.videos[trackIndex];
  const thumbUrl = `https://img.youtube.com/vi/${currentTrack.id}/mqdefault.jpg`;

  // Reset thumb error on track/playlist change
  useEffect(() => { setThumbError(false); }, [currentTrack.id, activePlaylist.id]);

  useEffect(() => {
    if (!window.YT) {
      const tag = document.createElement("script");
      tag.src = "https://www.youtube.com/iframe_api";
      document.head.appendChild(tag);
    }
    window.onYouTubeIframeAPIReady = initPlayer;
    if (window.YT?.Player) initPlayer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load video when trackIndex changes
  useEffect(() => {
    if (!playerReady || !playerRef.current) return;
    playerRef.current.loadVideoById(activePlaylist.videos[trackIndex].id);
    if (playing) playerRef.current.playVideo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackIndex, playerReady]);

  const initPlayer = () => {
    if (playerRef.current) return;
    playerRef.current = new window.YT.Player("yt-player", {
      height: "1",
      width: "1",
      videoId: currentTrack.id,
      playerVars: { autoplay: 0, controls: 0 },
      events: {
        onReady: (e: any) => {
          setPlayerReady(true);
          e.target.setVolume(70);
        },
        onStateChange: (e: any) => {
          if (e.data === 1) setPlaying(true);
          if (e.data === 2) setPlaying(false);
          if (e.data === 0) skipNext();
        }
      }
    });
  };

  const togglePlay = () => {
    if (!playerRef.current) return;
    if (playing) { playerRef.current.pauseVideo(); }
    else { playerRef.current.playVideo(); }
  };

  const skipNext = () => {
    const next = (trackIndex + 1) % activePlaylist.videos.length;
    setTrackIndex(next);
  };

  const skipPrev = () => {
    const prev = (trackIndex - 1 + activePlaylist.videos.length) % activePlaylist.videos.length;
    setTrackIndex(prev);
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
    if (playerRef.current) {
      playerRef.current.loadVideoById(pl.videos[0].id);
      playerRef.current.pauseVideo();
    }
  };

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      {/* Hidden YouTube player */}
      <div id="yt-player" className="hidden" ref={containerRef} />

      {/* Collapsed bar */}
      <div
        className="flex items-center gap-3 p-3 cursor-pointer hover:bg-muted/30 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className={`w-10 h-10 rounded-lg flex-shrink-0 overflow-hidden ${thumbError ? `bg-gradient-to-br ${activePlaylist.color}` : ''}`}>
          {!thumbError ? (
            <img
              src={thumbUrl}
              alt={currentTrack.title}
              className="w-full h-full object-cover"
              onError={() => setThumbError(true)}
            />
          ) : (
            <div className={`w-full h-full bg-gradient-to-br ${activePlaylist.color} flex items-center justify-center text-lg`}>
              {activePlaylist.emoji}
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{currentTrack.title}</p>
          <p className="text-xs text-muted-foreground truncate">{currentTrack.artist}</p>
        </div>
        <button onClick={e => { e.stopPropagation(); skipPrev(); }} className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
          <SkipBack className="h-4 w-4" />
        </button>
        <button onClick={e => { e.stopPropagation(); togglePlay(); }} className={`w-8 h-8 rounded-full bg-gradient-to-br ${activePlaylist.color} flex items-center justify-center text-white shadow-md`}>
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
            <input
              type="range" min={0} max={100} value={muted ? 0 : volume}
              onChange={e => changeVolume(Number(e.target.value))}
              className="flex-1 h-1.5 rounded-full accent-primary cursor-pointer"
            />
            <span className="text-xs text-muted-foreground w-7 text-right">{muted ? 0 : volume}%</span>
          </div>

          {/* Track list */}
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Tracks</p>
            {activePlaylist.videos.map((v, i) => (
              <button
                key={v.id}
                onClick={() => setTrackIndex(i)}
                className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left transition-colors ${i === trackIndex ? 'bg-primary/10 text-primary' : 'hover:bg-muted text-foreground'}`}
              >
                <Music className="h-3.5 w-3.5 flex-shrink-0" />
                <span className="text-sm truncate">{v.title}</span>
                <span className="text-xs text-muted-foreground ml-auto flex-shrink-0">{v.artist}</span>
              </button>
            ))}
          </div>

          {/* Playlist switcher */}
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Playlists</p>
            <div className="flex flex-wrap gap-2">
              {PLAYLISTS.map(pl => (
                <button
                  key={pl.id}
                  onClick={() => switchPlaylist(pl)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${activePlaylist.id === pl.id ? `bg-gradient-to-r ${pl.color} text-white shadow-md` : 'bg-muted text-muted-foreground hover:text-foreground'}`}
                >
                  <span>{pl.emoji}</span>
                  <span>{pl.name}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

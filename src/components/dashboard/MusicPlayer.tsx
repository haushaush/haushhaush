import { useState } from "react";
import { Play, Pause, SkipForward, SkipBack, Volume2, VolumeX, ChevronDown, ChevronUp, Music, Search, Loader2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useMusicPlayer, PLAYLISTS, type SearchResult } from "@/contexts/MusicPlayerContext";

export default function MusicPlayer() {
  const {
    activePlaylist, trackIndex, playing, volume, muted, currentTrack,
    togglePlay, skipNext, skipPrev, changeVolume, toggleMute, switchPlaylist, jumpToAbsolute, playSearchResult,
  } = useMusicPlayer();

  const [expanded, setExpanded] = useState(false);
  const [thumbError, setThumbError] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");

  const thumbUrl = `https://img.youtube.com/vi/${currentTrack.id}/hqdefault.jpg`;

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

  const handlePlayResult = (result: SearchResult) => {
    playSearchResult(result);
    setSearchResults([]);
    setSearchQuery("");
  };

  // Build upcoming queue across all playlists
  const getUpcomingTracks = () => {
    const result: Array<{ id: string; title: string; artist: string; playlistId: string; absolutePlaylistIndex: number; absoluteTrackIndex: number }> = [];
    let pIdx = PLAYLISTS.findIndex(p => p.id === activePlaylist.id);
    if (pIdx === -1) pIdx = 0;
    let tIdx = trackIndex;
    for (let i = 0; i < 5; i++) {
      const pl = PLAYLISTS[pIdx];
      if (pl.videos[tIdx]) {
        result.push({
          ...pl.videos[tIdx],
          playlistId: pl.id,
          absolutePlaylistIndex: pIdx,
          absoluteTrackIndex: tIdx,
        });
      }
      tIdx++;
      if (tIdx >= PLAYLISTS[pIdx].videos.length) {
        tIdx = 0;
        pIdx = (pIdx + 1) % PLAYLISTS.length;
      }
    }
    return result;
  };
  const upcomingQueue = getUpcomingTracks();

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
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
                    onClick={() => handlePlayResult(r)}
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
            {upcomingQueue.map((v, i) => {
              const isCurrent = i === 0 && v.playlistId === activePlaylist.id && v.absoluteTrackIndex === trackIndex;
              return (
                <button
                  key={`${v.id}-${v.absolutePlaylistIndex}-${v.absoluteTrackIndex}`}
                  onClick={() => jumpToAbsolute(v.absolutePlaylistIndex, v.absoluteTrackIndex)}
                  className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left transition-colors ${
                    isCurrent ? 'bg-primary/10 text-primary' : 'hover:bg-muted text-foreground'
                  }`}
                >
                  {isCurrent && playing ? (
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
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

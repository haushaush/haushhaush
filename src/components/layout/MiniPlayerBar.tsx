import { useState } from "react";
import { Play, Pause, SkipForward, Volume2, VolumeX } from "lucide-react";
import { useMusicPlayer } from "@/contexts/MusicPlayerContext";
import { useNavigate, useLocation } from "react-router-dom";

export function MiniPlayerBar() {
  const { currentTrack, playing, togglePlay, skipNext, volume, muted, changeVolume, toggleMute, hasEverPlayed } = useMusicPlayer();
  const [thumbError, setThumbError] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  // Only show when user has interacted with the player at least once
  if (!hasEverPlayed && !playing) return null;

  const thumbUrl = `https://img.youtube.com/vi/${currentTrack.id}/default.jpg`;
  const isOnDashboard = location.pathname === "/";

  return (
    <div className="w-full h-12 border-b border-border bg-muted/40 flex items-center gap-3 px-4 flex-shrink-0">
      {/* Thumbnail + track info */}
      <button
        onClick={() => !isOnDashboard && navigate("/")}
        className="flex items-center gap-2.5 min-w-0 flex-1 text-left hover:opacity-80 transition-opacity"
      >
        <div className="w-8 h-8 rounded overflow-hidden flex-shrink-0">
          {!thumbError ? (
            <img src={thumbUrl} alt="" className="w-full h-full object-cover" onError={() => setThumbError(true)} />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-teal-500 to-cyan-600" />
          )}
        </div>
        <div className="min-w-0">
          <p className="text-xs font-medium truncate">{currentTrack.title}</p>
          <p className="text-[11px] text-muted-foreground truncate">{currentTrack.artist}</p>
        </div>
      </button>

      {/* Controls */}
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <button onClick={togglePlay} className="w-7 h-7 rounded-full bg-foreground flex items-center justify-center text-background">
          {playing ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3 ml-px" />}
        </button>
        <button onClick={skipNext} className="p-1 text-muted-foreground hover:text-foreground transition-colors">
          <SkipForward className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Volume — hidden on very small screens */}
      <div className="hidden sm:flex items-center gap-1.5 flex-shrink-0 w-28">
        <button onClick={toggleMute} className="text-muted-foreground hover:text-foreground transition-colors">
          {muted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
        </button>
        <input
          type="range" min={0} max={100} value={muted ? 0 : volume}
          onChange={e => changeVolume(Number(e.target.value))}
          className="flex-1 h-1 rounded-full accent-primary cursor-pointer"
        />
      </div>
    </div>
  );
}

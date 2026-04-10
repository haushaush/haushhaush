import { useState } from "react";
import { Play, Pause, SkipForward, SkipBack, Volume2, VolumeX } from "lucide-react";
import { useMusicPlayer } from "@/contexts/MusicPlayerContext";
import { useNavigate, useLocation } from "react-router-dom";

function formatTime(s: number) {
  if (!s || !isFinite(s)) return "0:00";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

export function MiniPlayerBar() {
  const {
    currentTrack, playing, togglePlay, skipNext, skipPrev,
    volume, muted, changeVolume, toggleMute, hasEverPlayed,
    currentTime, duration, seekTo,
  } = useMusicPlayer();
  const [thumbError, setThumbError] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  if (!hasEverPlayed && !playing) return null;

  const thumbUrl = `https://img.youtube.com/vi/${currentTrack.id}/default.jpg`;
  const isOnDashboard = location.pathname === "/";
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  const handleBarClick = () => {
    if (!isOnDashboard) navigate("/");
  };

  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (duration <= 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    seekTo(pct * duration);
  };

  return (
    <div
      className="fixed top-0 left-0 right-0 z-[195] flex flex-col flex-shrink-0"
      style={{
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
      }}
    >
      <div
        className="w-full h-12 bg-background/70 border-b border-border/50 flex items-center gap-3 px-4 cursor-pointer"
        onClick={handleBarClick}
      >
        {/* Thumbnail + track info */}
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
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
        </div>

        {/* Controls */}
        <div className="flex items-center gap-1 flex-shrink-0" onClick={e => e.stopPropagation()}>
          <button onClick={skipPrev} className="p-1 text-muted-foreground hover:text-foreground transition-colors">
            <SkipBack className="h-3.5 w-3.5" />
          </button>
          <button onClick={togglePlay} className="w-7 h-7 rounded-full bg-foreground flex items-center justify-center text-background">
            {playing ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3 ml-px" />}
          </button>
          <button onClick={skipNext} className="p-1 text-muted-foreground hover:text-foreground transition-colors">
            <SkipForward className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Time */}
        <span className="text-[10px] text-muted-foreground tabular-nums flex-shrink-0 hidden sm:block" onClick={e => e.stopPropagation()}>
          {formatTime(currentTime)} / {formatTime(duration)}
        </span>

        {/* Volume — hidden on very small screens */}
        <div className="hidden md:flex items-center gap-1.5 flex-shrink-0 w-24" onClick={e => e.stopPropagation()}>
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

      {/* Thin progress bar at very bottom */}
      <div
        className="w-full h-[3px] bg-muted/30 cursor-pointer"
        onClick={handleProgressClick}
      >
        <div
          className="h-full bg-teal-500 transition-[width] duration-700 ease-linear"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}

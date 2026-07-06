import { useAudioStore } from "@/stores/audio";
import { useProjectStore } from "@/stores/project";
import { Button } from "@/ui/button";
import { Popover } from "@/ui/popover";
import { Slider } from "@/ui/slider";
import { VocalSeparationDropdown } from "@/ui/vocal-separation-dropdown";
import { formatTime } from "@/utils/format-time";
import {
  IconMusic,
  IconPlayerPauseFilled,
  IconPlayerPlayFilled,
  IconVolume,
  IconVolume2,
  IconVolume3,
} from "@/ui/icons/fa";
import { useCallback } from "react";

// -- Components ---------------------------------------------------------------

const PlayButton: React.FC<{ isPlaying: boolean; onClick: () => void }> = ({ isPlaying, onClick }) => (
  <Button onClick={onClick} className="size-10 rounded-full" aria-label={isPlaying ? "Pause" : "Play"}>
    {isPlaying ? <IconPlayerPauseFilled className="size-5" /> : <IconPlayerPlayFilled className="size-5" />}
  </Button>
);

const TimeDisplay: React.FC<{ current: number; duration: number }> = ({ current, duration }) => (
  <span className="font-mono text-sm select-text text-composer-text-secondary tabular-nums">
    {formatTime(current, 0)} / {formatTime(duration, 0)}
  </span>
);

const RATE_PRESETS = [0.5, 0.75, 1, 1.25, 1.5, 2];
const RATE_MIN = 0.25;
const RATE_MAX = 2;
const RATE_STEP = 0.05;

const PlaybackRateControl: React.FC<{
  rate: number;
  onChangeRate: (rate: number) => void;
}> = ({ rate, onChangeRate }) => {
  const handleSliderChange = useCallback(
    (value: number) => {
      onChangeRate(Math.round(value * 100) / 100);
    },
    [onChangeRate],
  );

  const displayRate = rate.toFixed(2);

  return (
    <Popover
      placement="top-end"
      trigger={
        <Button variant="ghost" className="font-mono tabular-nums min-w-12">
          {displayRate}x
        </Button>
      }
    >
      <div className="p-3">
        <div className="flex gap-1 mb-3">
          {RATE_PRESETS.map((preset) => (
            <Button
              key={preset}
              size="sm"
              variant={rate === preset ? "primary" : "secondary"}
              onClick={() => onChangeRate(preset)}
              className="font-mono"
            >
              {preset}x
            </Button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <span className="font-mono text-xs text-composer-text-muted">{RATE_MIN}x</span>
          <Slider
            value={rate}
            min={RATE_MIN}
            max={RATE_MAX}
            step={RATE_STEP}
            onChange={handleSliderChange}
            aria-label="Playback rate"
            className="w-full"
          />
          <span className="font-mono text-xs text-composer-text-muted">{RATE_MAX}x</span>
        </div>
      </div>
    </Popover>
  );
};

const VolumeControl: React.FC<{
  volume: number;
  isMuted: boolean;
  onChangeVolume: (volume: number) => void;
  onToggleMute: () => void;
}> = ({ volume, isMuted, onChangeVolume, onToggleMute }) => {
  const getVolumeIcon = () => {
    if (isMuted || volume === 0) return IconVolume3;
    if (volume < 0.5) return IconVolume2;
    return IconVolume;
  };

  const VolumeIcon = getVolumeIcon();
  const displayVolume = Math.round((isMuted ? 0 : volume) * 100);

  return (
    <Popover
      placement="top-end"
      trigger={
        <Button variant="ghost" size="icon" className="size-8" aria-label="Volume">
          <VolumeIcon className="size-4" />
        </Button>
      }
    >
      <div className="p-3 w-40">
        <div className="flex items-center gap-2 mb-2 justify-between pr-2.5">
          <Button
            variant="ghost"
            size="icon"
            className="size-7 shrink-0"
            onClick={onToggleMute}
            aria-label={isMuted ? "Unmute" : "Mute"}
          >
            <VolumeIcon className="size-4" />
          </Button>
          <span className="text-xs text-composer-text-muted tabular-nums w-8 text-right">{displayVolume}%</span>
        </div>
        <Slider
          value={isMuted ? 0 : volume}
          min={0}
          max={1}
          step={0.01}
          onChange={onChangeVolume}
          aria-label="Volume"
          className="w-full"
        />
      </div>
    </Popover>
  );
};

// Now-playing identity (cover + title / artist), Kodama-player style. Pulls the track
// metadata the importer already resolved (incl. the cover as a data URL).
const TrackMeta: React.FC = () => {
  const title = useProjectStore((s) => s.metadata.title);
  const artist = useProjectStore((s) => s.metadata.artist);
  const thumbnail = useProjectStore((s) => s.metadata.thumbnailDataUrl);

  return (
    <div className="flex items-center gap-3 w-[200px] min-w-0 shrink-0">
      <div className="flex items-center justify-center overflow-hidden rounded-md size-11 shrink-0 bg-composer-button">
        {thumbnail ? (
          <img src={thumbnail} alt="" className="object-cover size-full" />
        ) : (
          <IconMusic className="size-5 text-composer-text-muted" />
        )}
      </div>
      <div className="min-w-0">
        <div className="text-sm font-medium truncate text-composer-text" title={title}>
          {title || "Untitled"}
        </div>
        {artist && (
          <div className="text-xs truncate text-composer-text-muted" title={artist}>
            {artist}
          </div>
        )}
      </div>
    </div>
  );
};

const AudioPlayer: React.FC = () => {
  const source = useAudioStore((s) => s.source);
  const seekTo = useAudioStore((s) => s.seekTo);
  const isPlaying = useAudioStore((s) => s.isPlaying);
  const currentTime = useAudioStore((s) => s.currentTime);
  const duration = useAudioStore((s) => s.duration);
  const playbackRate = useAudioStore((s) => s.playbackRate);
  const volume = useAudioStore((s) => s.volume);
  const isMuted = useAudioStore((s) => s.isMuted);
  const setIsPlaying = useAudioStore((s) => s.setIsPlaying);
  const setPlaybackRate = useAudioStore((s) => s.setPlaybackRate);
  const setVolume = useAudioStore((s) => s.setVolume);
  const toggleMute = useAudioStore((s) => s.toggleMute);

  if (!source) return null;

  return (
    <div className="flex items-center gap-4 px-4 py-3 border-t select-none border-composer-border bg-composer-bg-dark">
      <TrackMeta />
      <PlayButton isPlaying={isPlaying} onClick={() => setIsPlaying(!isPlaying)} />
      <Slider
        value={currentTime}
        min={0}
        max={duration}
        onChange={seekTo}
        aria-label="Audio progress"
        className="flex-1 h-2"
      />
      <TimeDisplay current={currentTime} duration={duration} />
      <VolumeControl volume={volume} isMuted={isMuted} onChangeVolume={setVolume} onToggleMute={toggleMute} />
      <PlaybackRateControl rate={playbackRate} onChangeRate={setPlaybackRate} />
      <VocalSeparationDropdown />
    </div>
  );
};

// -- Exports ------------------------------------------------------------------

export { AudioPlayer };

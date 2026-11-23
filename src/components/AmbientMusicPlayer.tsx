'use client';

import { useEffect, useState } from 'react';
import { Music, Pause, Play, Volume1 } from 'lucide-react';
import { MUSIC_TRACKS, musicEngine, type MusicTrackId } from '@/lib/music';
import { cn } from '@/lib/utils';

export function AmbientMusicPlayer({ compact = false }: { compact?: boolean }) {
  const [playing, setPlaying] = useState(false);
  const [track, setTrack] = useState<MusicTrackId>('quiz');
  const [volume, setVolume] = useState(0.55);

  useEffect(() => {
    const sync = () => {
      const state = musicEngine.getState();
      setPlaying(state.playing);
      setTrack(state.track);
      setVolume(state.volume);
    };
    sync();
    return musicEngine.subscribe(sync);
  }, []);

  const handleToggle = () => {
    const next = musicEngine.toggle();
    setPlaying(next);
  };

  const handleTrackChange = (nextTrack: MusicTrackId) => {
    setTrack(nextTrack);
    musicEngine.setTrack(nextTrack);
  };

  const handleVolumeChange = (nextVol: number) => {
    setVolume(nextVol);
    musicEngine.setVolume(nextVol);
  };

  if (compact) {
    return (
      <button
        type="button"
        onClick={handleToggle}
        className={cn(
          'inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors',
          playing
            ? 'bg-indigo-50 border-indigo-200 text-indigo-700'
            : 'bg-white border-zinc-200 text-zinc-600 hover:bg-zinc-50'
        )}
        title={playing ? 'Pausar trilha musical' : 'Tocar trilha musical'}
      >
        {playing ? <Pause className="w-3.5 h-3.5" /> : <Music className="w-3.5 h-3.5" />}
        <span>{playing ? 'Tocando' : 'Música'}</span>
      </button>
    );
  }

  return (
    <div className="rounded-xl border border-zinc-200/80 bg-white p-3 space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div
            className={cn(
              'w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-colors',
              playing ? 'bg-indigo-600 text-white shadow-xs' : 'bg-zinc-100 text-zinc-500'
            )}
          >
            <Music className={cn('w-3.5 h-3.5', playing && 'animate-bounce')} />
          </div>
          <div className="min-w-0 leading-tight">
            <div className="text-xs font-semibold text-zinc-900 truncate">Trilha sonora</div>
            <div className="text-[11px] text-zinc-500 truncate">
              {MUSIC_TRACKS.find((t) => t.id === track)?.label}
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={handleToggle}
          className={cn(
            'w-7 h-7 rounded-lg flex items-center justify-center transition-colors shrink-0',
            playing
              ? 'bg-zinc-900 text-white hover:bg-zinc-800'
              : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200'
          )}
          aria-label={playing ? 'Pausar música' : 'Tocar música'}
        >
          {playing ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 ml-0.5" />}
        </button>
      </div>

      {/* Seletor de 4 estilos */}
      <div className="grid grid-cols-2 gap-1">
        {MUSIC_TRACKS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => handleTrackChange(item.id)}
            className={cn(
              'px-2 py-1 rounded-md text-[10.5px] font-medium transition-colors truncate',
              track === item.id
                ? 'bg-zinc-900 text-white'
                : 'bg-zinc-100/80 text-zinc-600 hover:bg-zinc-200/70'
            )}
            title={item.subtitle}
          >
            {item.label}
          </button>
        ))}
      </div>

      {/* Controle de volume */}
      <div className="flex items-center gap-2">
        <Volume1 className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={volume}
          onChange={(e) => handleVolumeChange(Number(e.target.value))}
          aria-label="Volume da trilha sonora"
          className="w-full h-1 accent-indigo-600 cursor-pointer"
        />
      </div>
    </div>
  );
}

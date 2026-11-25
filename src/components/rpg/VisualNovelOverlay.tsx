'use client';

import { useEffect, useState } from 'react';
import { ChevronRight, SkipForward } from 'lucide-react';
import { PortraitAvatar } from '@/components/rpg/RpgArtwork';
import { playRpgSfx } from '@/lib/rpg/audio';
import type { RpgDialogueScene } from '@/types/rpg';

export function VisualNovelOverlay({
  scene,
  onComplete,
}: {
  scene: RpgDialogueScene;
  onComplete: () => void;
}) {
  const [lineIndex, setLineIndex] = useState(0);
  const [charCount, setCharCount] = useState(0);
  const current = scene.lines[lineIndex];
  const isLast = lineIndex >= scene.lines.length - 1;
  const isTyping = current ? charCount < current.text.length : false;

  useEffect(() => {
    setCharCount(0);
  }, [lineIndex, scene.id]);

  useEffect(() => {
    if (!current || charCount >= current.text.length) return;
    const timer = window.setTimeout(() => {
      setCharCount((c) => c + 2);
      if (charCount % 8 === 0) {
        playRpgSfx('dialogue_blip');
      }
    }, 24);
    return () => window.clearTimeout(timer);
  }, [charCount, current]);

  if (!current) return null;

  const handleAdvance = () => {
    if (isTyping) {
      setCharCount(current.text.length);
      return;
    }
    playRpgSfx('click');
    if (isLast) {
      onComplete();
    } else {
      setLineIndex((i) => i + 1);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-[2px] p-4 sm:p-8 animate-card-enter"
      onClick={handleAdvance}
    >
      <div
        className="w-full max-w-3xl rpg-panel-gold rounded-3xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-2.5 bg-gradient-to-r from-[#c9974b]/25 via-[#745338]/20 to-transparent border-b border-[#745338] flex items-center justify-between">
          <span className="text-xs font-extrabold uppercase tracking-[0.2em] text-[#f7dc94]">
            {scene.title}
          </span>
          <button
            type="button"
            onClick={() => {
              playRpgSfx('click');
              onComplete();
            }}
            className="inline-flex items-center gap-1 text-xs text-[#c9b29b] hover:text-white transition-colors"
          >
            <SkipForward className="w-3.5 h-3.5" />
            Pular cena
          </button>
        </div>

        <div className="p-5 sm:p-6 flex flex-col sm:flex-row items-start sm:items-center gap-5">
          <PortraitAvatar portraitId={current.portraitId} />
          <div className="flex-1 min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-base font-extrabold text-[#fef3c7]">
                {current.speakerName}
              </span>
              <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-[#c9974b]/20 text-[#f7dc94] border border-[#c9974b]/45">
                {current.speakerRole}
              </span>
            </div>
            <p className="text-sm sm:text-base text-[#efe3d4] leading-relaxed min-h-[3.5rem]">
              {current.text.slice(0, charCount)}
              {isTyping && <span className="inline-block w-2 h-4 ml-1 bg-[#f7dc94] animate-pulse align-middle" />}
            </p>
          </div>
        </div>

        <div className="px-5 py-3.5 bg-[#16100e]/85 border-t border-[#745338]/70 flex items-center justify-between">
          <span className="text-xs text-[#b8a38f]">
            Diálogo {lineIndex + 1} de {scene.lines.length}
          </span>
          <button
            type="button"
            onClick={handleAdvance}
            className="rpg-btn-gold inline-flex items-center gap-1.5 px-5 py-2 rounded-xl text-sm font-extrabold"
          >
            {isTyping ? 'Revelar' : isLast ? 'Iniciar Exploração' : 'Continuar'}
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

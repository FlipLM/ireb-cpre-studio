'use client';

import { useEffect, useState } from 'react';
import { Coins, Lightbulb, Sparkles } from 'lucide-react';
import { ItemIcon, VfxBurst } from '@/components/rpg/RpgArtwork';
import { playRpgSfx } from '@/lib/rpg/audio';
import { RPG_BALANCE } from '@/lib/rpg/balance';
import { cn } from '@/lib/utils';
import type { RpgCampaignSnapshot, RpgRarity } from '@/types/rpg';

interface ClaimedChestReward {
  chestIndex: number;
  chestStyle: 'wood' | 'gold';
  itemId: string;
  itemName: string;
  itemRarity: RpgRarity;
  itemDescription: string;
  bonusGold: number;
  bonusHints: number;
}

export function RewardChestModal({
  nodeId,
  chestStyle,
  onSnapshotUpdate,
  onClose,
}: {
  nodeId: string;
  chestStyle: 'wood' | 'gold';
  onSnapshotUpdate: (snapshot: RpgCampaignSnapshot) => void;
  onClose: () => void;
}) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [phase, setPhase] = useState<'idle' | 'shaking' | 'opened'>('idle');
  const [vfxKey, setVfxKey] = useState(0);
  const [reward, setReward] = useState<ClaimedChestReward | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (phase !== 'shaking') return;
    const timer = window.setTimeout(() => {
      setPhase('opened');
      setVfxKey(Date.now());
      playRpgSfx('level_up');
    }, 520);
    return () => window.clearTimeout(timer);
  }, [phase]);

  const handlePickChest = async (idx: number) => {
    if (selectedIndex !== null) return;
    setSelectedIndex(idx);
    setPhase('shaking');
    setError(null);
    playRpgSfx('chest_open');

    try {
      const res = await fetch('/api/rpg/reward/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nodeId, chestIndex: idx }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao abrir baú.');
      setReward(data);
      onSnapshotUpdate(data.snapshot);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao abrir baú.');
    }
  };

  const rarityMeta = reward ? RPG_BALANCE.rarityMeta[reward.itemRarity] : null;
  const isOpened = phase === 'opened';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4 animate-card-enter">
      <div className="w-full max-w-2xl rpg-panel-gold rounded-3xl p-6 sm:p-8 text-center space-y-6">
        <div className="space-y-1.5">
          <div className="inline-flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-[0.22em] text-[#f7dc94]">
            <Sparkles className="w-4 h-4 text-[#f5c451]" />
            {chestStyle === 'gold' ? 'Recompensa de Elite' : 'Fase Concluída — Recompensa'}
          </div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-amber-50">
            {selectedIndex === null
              ? 'Escolha um Baú de Prêmio!'
              : isOpened && reward
                ? 'Tesouro Conquistado!'
                : 'Abrindo Baú...'}
          </h2>
          <p className="text-xs sm:text-sm text-[#d4c0ac]">
            {selectedIndex === null
              ? 'Selecione 1 dos 3 baús abaixo para revelar seu item, recarga ou relíquia.'
              : 'Os itens conquistados vão direto para a sua mochila da campanha.'}
          </p>
        </div>

        {/* 3 Baús Limpos com Animação de Tremor + Explosão Dourada + Abertura */}
        <div className="grid grid-cols-3 gap-3 sm:gap-5 pt-2">
          {[0, 1, 2].map((idx) => {
            const isPicked = selectedIndex === idx;
            const isOther = selectedIndex !== null && !isPicked;
            const showOpen = isPicked && isOpened;

            return (
              <button
                key={idx}
                type="button"
                disabled={selectedIndex !== null}
                onClick={() => handlePickChest(idx)}
                className={cn(
                  'relative rounded-2xl border-2 p-4 flex flex-col items-center justify-center gap-3 transition-all overflow-hidden',
                  selectedIndex === null &&
                    'bg-[#261b16]/90 border-[#c9974b]/70 hover:border-[#fde68a] hover:scale-105 hover:shadow-[0_0_28px_rgba(245,196,81,0.45)] cursor-pointer',
                  isPicked &&
                    'bg-[#332318] border-[#fde68a] scale-105 shadow-[0_0_38px_rgba(245,196,81,0.7)]',
                  isOther && 'bg-[#17110f]/60 border-[#4a3528]/50 opacity-35 scale-95'
                )}
              >
                {showOpen && (
                  <>
                    <div
                      className="pointer-events-none absolute inset-0"
                      style={{
                        background:
                          'radial-gradient(circle at 50% 45%, rgba(251, 191, 36, 0.32), transparent 70%)',
                      }}
                    />
                    <VfxBurst type="heal" triggerKey={vfxKey} size={115} />
                  </>
                )}

                <div className="relative z-10 w-24 h-24 sm:w-28 sm:h-28 flex items-center justify-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={showOpen ? '/rpg/chests/chest-open.png' : '/rpg/chests/chest-closed.png'}
                    alt={`Baú ${idx + 1}`}
                    className={cn(
                      'w-full h-full object-contain rpg-pixel drop-shadow-[0_8px_14px_rgba(0,0,0,0.75)]',
                      selectedIndex === null && 'animate-rpg-bob',
                      isPicked && phase === 'shaking' && 'animate-rpg-hit',
                      chestStyle === 'gold' && 'brightness-110 saturate-125'
                    )}
                  />
                </div>
                <span className="relative z-10 text-xs font-extrabold uppercase tracking-wider text-[#f7dc94]">
                  {isPicked ? (isOpened ? 'Aberto!' : 'Abrindo...') : `Baú ${idx + 1}`}
                </span>
              </button>
            );
          })}
        </div>

        {error && (
          <div className="rounded-xl bg-rose-950/70 border border-rose-400/50 px-4 py-2.5 text-xs text-rose-200">
            {error}
          </div>
        )}

        {isOpened && reward && rarityMeta && (
          <div
            className={cn(
              'rounded-2xl border-2 p-4 sm:p-5 flex flex-col sm:flex-row items-center gap-4 text-left animate-card-enter',
              rarityMeta.border,
              rarityMeta.bg
            )}
          >
            <ItemIcon itemId={reward.itemId} size={64} />
            <div className="flex-1 min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-lg font-extrabold text-white">{reward.itemName}</span>
                <span
                  className={cn(
                    'text-[10.5px] font-extrabold uppercase px-2 py-0.5 rounded bg-black/50',
                    rarityMeta.color
                  )}
                >
                  {rarityMeta.label}
                </span>
              </div>
              <p className="text-xs sm:text-sm text-slate-200">{reward.itemDescription}</p>
              <div className="flex flex-wrap items-center gap-2 pt-1 text-xs font-extrabold">
                {reward.bonusGold > 0 && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-yellow-500/20 text-yellow-200">
                    <Coins className="w-3.5 h-3.5" /> +{reward.bonusGold} Ouro
                  </span>
                )}
                {reward.bonusHints > 0 && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-amber-500/20 text-amber-200">
                    <Lightbulb className="w-3.5 h-3.5" /> +{reward.bonusHints} Dica
                  </span>
                )}
              </div>
            </div>
          </div>
        )}

        {isOpened && (
          <button
            type="button"
            onClick={() => {
              playRpgSfx('click');
              onClose();
            }}
            className="rpg-btn-gold px-8 py-3 rounded-xl text-sm font-extrabold"
          >
            Coletar e Voltar ao Mapa
          </button>
        )}
      </div>
    </div>
  );
}

'use client';

import { useState } from 'react';
import { Gift, Loader2, Sparkles, X, Zap } from 'lucide-react';
import { playSound } from '@/lib/sounds';
import { cn } from '@/lib/utils';
import type { RpgCampaignSnapshot, RpgEventDefinition, RpgMapNode } from '@/types/rpg';

export function EventAndChestModal({
  node,
  event,
  chestReward,
  onSnapshotUpdate,
  onClose,
}: {
  node: RpgMapNode;
  event?: RpgEventDefinition;
  chestReward?: { itemId: string; itemName: string; gold: number; xp: number };
  onSnapshotUpdate: (snapshot: RpgCampaignSnapshot) => void;
  onClose: () => void;
}) {
  const [busyChoice, setBusyChoice] = useState<string | null>(null);
  const [outcomeNarrative, setOutcomeNarrative] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleChoose = async (choiceId: string) => {
    setBusyChoice(choiceId);
    setError(null);
    try {
      const res = await fetch('/api/rpg/event/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nodeId: node.id, choiceId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao resolver evento.');
      playSound('favorite');
      setOutcomeNarrative(data.narrative);
      onSnapshotUpdate(data.snapshot);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao processar escolha.');
    } finally {
      setBusyChoice(null);
    }
  };

  if (chestReward) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
        <div className="w-full max-w-md rounded-3xl border-2 border-amber-400/50 bg-slate-900 p-6 text-center space-y-5 shadow-2xl">
          <div className="w-16 h-16 rounded-2xl bg-amber-500/20 border border-amber-400/50 flex items-center justify-center mx-auto">
            <Gift className="w-8 h-8 text-amber-300" />
          </div>
          <div className="space-y-1.5">
            <div className="text-xs font-bold uppercase tracking-widest text-amber-300">
              Baú Descoberto!
            </div>
            <h3 className="text-xl font-extrabold text-white">{chestReward.itemName}</h3>
            <p className="text-xs text-slate-300">
              Item adicionado à sua mochila junto com recompensas de exploração.
            </p>
          </div>
          <div className="flex justify-center gap-2 text-xs font-bold">
            <span className="px-3 py-1.5 rounded-lg bg-amber-500/20 text-amber-200">
              +{chestReward.xp} XP
            </span>
            <span className="px-3 py-1.5 rounded-lg bg-yellow-500/20 text-yellow-200">
              +{chestReward.gold} Ouro
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-sm font-bold"
          >
            Continuar Exploração
          </button>
        </div>
      </div>
    );
  }

  if (!event) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-2xl rounded-3xl border border-white/15 bg-slate-900 text-slate-100 shadow-2xl overflow-hidden">
        <div className="px-5 py-4 bg-slate-950/85 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {event.kind === 'gap' ? (
              <Zap className="w-5 h-5 text-amber-400" />
            ) : (
              <Sparkles className="w-5 h-5 text-indigo-400" />
            )}
            <div>
              <div className="text-[11px] font-bold uppercase tracking-widest text-amber-300">
                {event.kind === 'gap' ? 'Evento Gap Inesperado' : 'Evento Narrativo'}
              </div>
              <h3 className="text-base font-bold text-white">{event.title}</h3>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/10"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 sm:p-6 space-y-5">
          <p className="text-sm sm:text-base text-slate-200 leading-relaxed">{event.description}</p>

          {error && (
            <div className="rounded-xl bg-rose-950/60 border border-rose-400/40 px-4 py-2.5 text-xs text-rose-200">
              {error}
            </div>
          )}

          {outcomeNarrative ? (
            <div className="space-y-4">
              <div className="rounded-2xl border border-emerald-400/40 bg-emerald-950/40 p-4 text-sm text-emerald-100 leading-relaxed">
                {outcomeNarrative}
              </div>
              <button
                type="button"
                onClick={onClose}
                className="w-full py-2.5 rounded-xl bg-white text-slate-950 hover:bg-slate-200 text-sm font-bold"
              >
                Voltar ao Mapa
              </button>
            </div>
          ) : (
            <div className="space-y-2.5">
              {event.choices.map((choice) => (
                <button
                  key={choice.id}
                  type="button"
                  disabled={busyChoice !== null}
                  onClick={() => handleChoose(choice.id)}
                  className="w-full text-left rounded-2xl border border-white/15 bg-slate-950/60 hover:border-amber-400/60 hover:bg-slate-950/90 p-4 transition-all space-y-1"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-bold text-white flex items-center gap-2">
                      {busyChoice === choice.id && <Loader2 className="w-4 h-4 animate-spin" />}
                      {choice.label}
                    </span>
                    <span
                      className={cn(
                        'text-[10px] font-bold uppercase px-2 py-0.5 rounded-full',
                        choice.riskTag === 'safe' && 'bg-emerald-500/20 text-emerald-300',
                        choice.riskTag === 'balanced' && 'bg-sky-500/20 text-sky-300',
                        choice.riskTag === 'risky' && 'bg-rose-500/20 text-rose-300'
                      )}
                    >
                      {choice.riskTag === 'safe' ? 'Seguro' : choice.riskTag === 'balanced' ? 'Equilibrado' : 'Arriscado'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400">{choice.description}</p>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

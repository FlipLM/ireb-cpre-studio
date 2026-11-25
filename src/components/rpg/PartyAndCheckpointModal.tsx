'use client';

import { useState } from 'react';
import {
  ArrowUpCircle,
  Check,
  Heart,
  Loader2,
  Lock,
  Shield,
  Sparkles,
  Tent,
  Users,
  X,
} from 'lucide-react';
import { HeroSprite } from '@/components/rpg/RpgArtwork';
import { playRpgSfx } from '@/lib/rpg/audio';
import { RPG_BALANCE } from '@/lib/rpg/balance';
import { getHeroClassDefinition } from '@/lib/rpg/data/heroes';
import { cn } from '@/lib/utils';
import type { RpgCampaignSnapshot, RpgHeroState, RpgStatKey } from '@/types/rpg';

const STAT_LABELS: Array<{ key: RpgStatKey; label: string; delta: string }> = [
  { key: 'maxHp', label: 'Vida Máxima', delta: `+${RPG_BALANCE.levelUp.increments.maxHp}` },
  { key: 'baseDamage', label: 'Dano-Base', delta: `+${RPG_BALANCE.levelUp.increments.baseDamage}` },
  { key: 'intelligence', label: 'Inteligência (Dicas)', delta: `+${RPG_BALANCE.levelUp.increments.intelligence}` },
  { key: 'parryChance', label: 'Chance de Parry', delta: `+${Math.round(RPG_BALANCE.levelUp.increments.parryChance * 100)}%` },
  { key: 'critChance', label: 'Chance de Crítico', delta: `+${Math.round(RPG_BALANCE.levelUp.increments.critChance * 100)}%` },
];

export function PartyAndCheckpointModal({
  heroes,
  isAtCheckpoint,
  mode,
  onSnapshotUpdate,
  onClose,
}: {
  heroes: RpgHeroState[];
  isAtCheckpoint: boolean;
  mode: 'party' | 'checkpoint';
  onSnapshotUpdate: (snapshot: RpgCampaignSnapshot) => void;
  onClose: () => void;
}) {
  const [selectedIds, setSelectedIds] = useState<string[]>(
    heroes.filter((h) => h.isEquipped).map((h) => h.id)
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const toggleHeroEquip = (heroId: string) => {
    if (!isAtCheckpoint) return;
    setSelectedIds((prev) => {
      if (prev.includes(heroId)) {
        return prev.length > 1 ? prev.filter((id) => id !== heroId) : prev;
      }
      if (prev.length >= RPG_BALANCE.campaign.maxEquippedHeroes) return prev;
      return [...prev, heroId];
    });
  };

  const callCheckpointApi = async (body: Record<string, unknown>, busyKey: string) => {
    setBusy(busyKey);
    setError(null);
    setFeedback(null);
    try {
      const res = await fetch('/api/rpg/checkpoint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha na operação.');
      if (busyKey === 'rest') playRpgSfx('heal_chime');
      else if (busyKey.startsWith('stat-')) playRpgSfx('level_up');
      else playRpgSfx('click');
      setFeedback(data.message);
      onSnapshotUpdate(data.snapshot);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao atualizar heróis.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-3 sm:p-6 overflow-y-auto">
      <div className="w-full max-w-4xl my-auto rounded-3xl border border-white/15 bg-slate-900 text-slate-100 shadow-2xl overflow-hidden">
        <div className="px-5 py-4 bg-slate-950/85 border-b border-white/10 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            {mode === 'checkpoint' ? (
              <Tent className="w-5 h-5 text-sky-400" />
            ) : (
              <Users className="w-5 h-5 text-amber-400" />
            )}
            <div>
              <h3 className="text-base font-bold text-white">
                {mode === 'checkpoint' ? 'Acampamento — Checkpoint' : 'Heróis da Jornada'}
              </h3>
              <p className="text-xs text-slate-400">
                {isAtCheckpoint
                  ? 'Você está em um Checkpoint: cure o grupo, troque até 3 heróis equipados e distribua pontos de nível.'
                  : 'Consulte seus heróis e atributos. A troca de heróis equipados só é liberada em Checkpoints.'}
              </p>
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

        <div className="p-5 sm:p-6 space-y-5 max-h-[75vh] overflow-y-auto">
          {isAtCheckpoint && (
            <div className="rounded-2xl border border-sky-400/40 bg-sky-950/35 p-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-sm font-bold text-sky-200">Descanso Estratégico no Checkpoint</div>
                <div className="text-xs text-sky-300/80">
                  Cura 100% da vida dos heróis equipados e restaura parte das dicas do grupo.
                </div>
              </div>
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => callCheckpointApi({ action: 'rest' }, 'rest')}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 text-xs font-bold"
              >
                {busy === 'rest' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Heart className="w-4 h-4" />}
                Descansar e Curar Grupo
              </button>
            </div>
          )}

          {feedback && (
            <div className="rounded-xl bg-emerald-950/60 border border-emerald-400/40 px-4 py-2.5 text-xs text-emerald-200">
              {feedback}
            </div>
          )}
          {error && (
            <div className="rounded-xl bg-rose-950/60 border border-rose-400/40 px-4 py-2.5 text-xs text-rose-200">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {heroes.map((hero) => {
              const cls = getHeroClassDefinition(hero.heroClassId);
              const isSelected = selectedIds.includes(hero.id);
              const xpPct = Math.min(100, Math.round((hero.xp / Math.max(1, hero.xpToNextLevel)) * 100));

              return (
                <div
                  key={hero.id}
                  className={cn(
                    'rounded-2xl border p-4 space-y-3 transition-all',
                    !hero.isUnlocked && 'opacity-55 bg-slate-950/40 border-slate-800',
                    hero.isUnlocked && isSelected && 'bg-indigo-950/40 border-amber-400/60',
                    hero.isUnlocked && !isSelected && 'bg-slate-950/70 border-white/10'
                  )}
                >
                  <div className="flex items-start gap-3">
                    <HeroSprite heroClassId={hero.heroClassId} size={68} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-bold text-white truncate">{hero.name}</span>
                        {hero.isUnlocked ? (
                          <span className="text-xs font-bold px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300">
                            Nv. {hero.level}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] text-slate-400">
                            <Lock className="w-3 h-3" /> Bloqueado
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-indigo-300 font-medium">{cls.title}</div>
                      <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                        {hero.isUnlocked ? cls.description : cls.unlockRequirementText}
                      </p>
                    </div>
                  </div>

                  {hero.isUnlocked && (
                    <>
                      <div className="grid grid-cols-3 gap-2 text-[11px]">
                        <div className="rounded-lg bg-slate-900/90 px-2.5 py-1.5">
                          <div className="text-slate-400">HP</div>
                          <div className="font-bold text-emerald-300">{hero.currentHp}/{hero.maxHp}</div>
                        </div>
                        <div className="rounded-lg bg-slate-900/90 px-2.5 py-1.5">
                          <div className="text-slate-400">Dano</div>
                          <div className="font-bold text-amber-300">{hero.baseDamage}</div>
                        </div>
                        <div className="rounded-lg bg-slate-900/90 px-2.5 py-1.5">
                          <div className="text-slate-400">Dicas (INT)</div>
                          <div className="font-bold text-sky-300">{hero.intelligence}</div>
                        </div>
                        <div className="rounded-lg bg-slate-900/90 px-2.5 py-1.5">
                          <div className="text-slate-400">Parry</div>
                          <div className="font-bold text-indigo-300">{Math.round(hero.parryChance * 100)}%</div>
                        </div>
                        <div className="rounded-lg bg-slate-900/90 px-2.5 py-1.5">
                          <div className="text-slate-400">Crítico</div>
                          <div className="font-bold text-rose-300">{Math.round(hero.critChance * 100)}%</div>
                        </div>
                        <div className="rounded-lg bg-slate-900/90 px-2.5 py-1.5">
                          <div className="text-slate-400">Mult. Crít.</div>
                          <div className="font-bold text-violet-300">{hero.critMultiplier}×</div>
                        </div>
                      </div>

                      {/* Barra de XP */}
                      <div className="space-y-1">
                        <div className="flex justify-between text-[11px] text-slate-400">
                          <span>Experiência</span>
                          <span>{hero.xp} / {hero.xpToNextLevel} XP</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
                          <div className="h-full bg-indigo-400" style={{ width: `${xpPct}%` }} />
                        </div>
                      </div>

                      {/* Distribuição manual de pontos de atributo ao subir de nível */}
                      {hero.unspentStatPoints > 0 && (
                        <div className="rounded-xl border border-amber-400/40 bg-amber-950/30 p-3 space-y-2">
                          <div className="flex items-center gap-1.5 text-xs font-bold text-amber-300">
                            <ArrowUpCircle className="w-4 h-4" />
                            {hero.unspentStatPoints} ponto(s) de atributo disponível(is)!
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {STAT_LABELS.map((st) => (
                              <button
                                key={st.key}
                                type="button"
                                disabled={busy !== null}
                                onClick={() =>
                                  callCheckpointApi(
                                    { action: 'spend_stat_point', heroId: hero.id, stat: st.key },
                                    `stat-${hero.id}-${st.key}`
                                  )
                                }
                                className="px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/35 border border-amber-400/50 text-[11px] font-bold text-amber-200"
                              >
                                {st.label} ({st.delta})
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Equipar/Desequipar (somente em Checkpoint) */}
                      <div className="flex items-center justify-between pt-1">
                        <span className="text-[11px] text-slate-400 inline-flex items-center gap-1">
                          <Shield className="w-3.5 h-3.5 text-slate-500" />
                          {hero.equippedItemIds.length} equipamento(s)
                        </span>
                        <button
                          type="button"
                          disabled={!isAtCheckpoint}
                          onClick={() => toggleHeroEquip(hero.id)}
                          className={cn(
                            'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors',
                            isSelected
                              ? 'bg-emerald-500/25 border border-emerald-400/60 text-emerald-200'
                              : 'bg-white/10 border border-white/15 text-slate-200 hover:bg-white/20',
                            !isAtCheckpoint && 'opacity-50 cursor-not-allowed'
                          )}
                        >
                          {isSelected && <Check className="w-3.5 h-3.5" />}
                          {isSelected ? 'Equipado no Grupo' : 'Equipar'}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="px-5 py-4 bg-slate-950/85 border-t border-white/10 flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-slate-400 inline-flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-amber-400" />
            Selecionados: {selectedIds.length} / {RPG_BALANCE.campaign.maxEquippedHeroes} heróis
          </div>
          <div className="flex items-center gap-2.5">
            {isAtCheckpoint && (
              <button
                type="button"
                disabled={busy !== null}
                onClick={() =>
                  callCheckpointApi({ action: 'equip_heroes', heroIds: selectedIds }, 'equip')
                }
                className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold"
              >
                {busy === 'equip' && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Salvar Formação do Grupo
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold"
            >
              Fechar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

'use client';

import { useState } from 'react';
import { Backpack, Loader2, Shield, Sparkles, X } from 'lucide-react';
import { ItemIcon } from '@/components/rpg/RpgArtwork';
import { playRpgSfx } from '@/lib/rpg/audio';
import { RPG_BALANCE } from '@/lib/rpg/balance';
import { getItemDefinition } from '@/lib/rpg/data/items';
import { cn } from '@/lib/utils';
import type { RpgCampaignSnapshot, RpgHeroState, RpgInventoryEntry } from '@/types/rpg';

export function InventoryModal({
  inventory,
  heroes,
  onSnapshotUpdate,
  onClose,
}: {
  inventory: RpgInventoryEntry[];
  heroes: RpgHeroState[];
  onSnapshotUpdate: (snapshot: RpgCampaignSnapshot) => void;
  onClose: () => void;
}) {
  const unlockedHeroes = heroes.filter((h) => h.isUnlocked);
  const [targetHeroId, setTargetHeroId] = useState<string>(unlockedHeroes[0]?.id ?? '');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runAction = async (itemId: string, action: 'use' | 'equip' | 'unequip', heroId?: string) => {
    setBusyId(`${itemId}-${action}`);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch('/api/rpg/inventory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId, action, heroId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao usar item.');
      playRpgSfx(action === 'use' ? 'heal_chime' : 'click');
      setMessage(data.message);
      onSnapshotUpdate(data.snapshot);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro no inventário.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-3 sm:p-6 overflow-y-auto">
      <div className="w-full max-w-3xl my-auto rpg-panel-gold rounded-3xl text-amber-50 overflow-hidden animate-card-enter">
        <div className="px-5 py-4 bg-[#1a1210]/90 border-b border-[#745338] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Backpack className="w-5 h-5 text-[#f5c451]" />
            <div>
              <h3 className="text-base font-extrabold text-amber-50">Mochila e Relíquias</h3>
              <p className="text-xs text-[#c9b29b]">
                Use poções, pergaminhos e equipe artefatos nos seus heróis desbloqueados.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              playRpgSfx('click');
              onClose();
            }}
            className="p-2 rounded-xl text-[#c9b29b] hover:text-white hover:bg-white/10"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 sm:p-6 space-y-5 max-h-[75vh] overflow-y-auto">
          {unlockedHeroes.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="text-[#c9b29b] font-bold">Herói alvo para equipar:</span>
              {unlockedHeroes.map((h) => (
                <button
                  key={h.id}
                  type="button"
                  onClick={() => {
                    playRpgSfx('click');
                    setTargetHeroId(h.id);
                  }}
                  className={cn(
                    'px-3 py-1.5 rounded-lg border font-bold transition-colors',
                    targetHeroId === h.id
                      ? 'bg-[#c9974b]/30 border-[#f5c451] text-[#fef3c7]'
                      : 'bg-[#17100e] border-[#745338] text-[#c9b29b]'
                  )}
                >
                  {h.name}
                </button>
              ))}
            </div>
          )}

          {message && (
            <div className="rounded-xl bg-emerald-950/70 border border-emerald-400/50 px-4 py-2.5 text-xs text-emerald-200">
              {message}
            </div>
          )}
          {error && (
            <div className="rounded-xl bg-rose-950/70 border border-rose-400/50 px-4 py-2.5 text-xs text-rose-200">
              {error}
            </div>
          )}

          <div className="space-y-2.5">
            <div className="text-xs font-extrabold uppercase tracking-wider text-[#f7dc94]">
              Itens Disponíveis
            </div>
            {inventory.length === 0 ? (
              <div className="rpg-panel rounded-2xl p-5 text-sm text-[#b8a38f] text-center">
                Mochila vazia. Abra baús, explore eventos e derrote chefes para conquistar itens!
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {inventory.map((entry) => {
                  const def = getItemDefinition(entry.itemId);
                  if (!def) return null;
                  const meta = RPG_BALANCE.rarityMeta[def.rarity];
                  const isElim = def.category === 'eliminate_option';

                  return (
                    <div
                      key={entry.id}
                      className={cn('rounded-2xl border-2 p-3.5 flex flex-col justify-between gap-3', meta.border, meta.bg)}
                    >
                      <div className="flex items-start gap-3">
                        <ItemIcon itemId={def.id} size={48} />
                        <div className="flex-1 min-w-0 space-y-0.5">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-extrabold text-white truncate">{def.name}</span>
                            <span className="text-xs font-extrabold px-2 py-0.5 rounded bg-black/60 text-[#fde68a]">
                              ×{entry.quantity}
                            </span>
                          </div>
                          <div className={cn('text-[10.5px] font-extrabold uppercase tracking-wider', meta.color)}>
                            {meta.label} • {def.usageType === 'equipment' ? 'Equipamento' : 'Consumível'}
                          </div>
                          <p className="text-xs text-slate-200/90 leading-relaxed">{def.description}</p>
                        </div>
                      </div>

                      <div className="flex justify-end">
                        {isElim ? (
                          <span className="text-[11px] text-sky-300 italic">
                            Usável dentro de desafios de múltipla escolha
                          </span>
                        ) : def.usageType === 'consumable' ? (
                          <button
                            type="button"
                            disabled={busyId !== null}
                            onClick={() => runAction(def.id, 'use')}
                            className="rpg-btn-gold inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-extrabold"
                          >
                            {busyId === `${def.id}-use` ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Sparkles className="w-3.5 h-3.5" />
                            )}
                            Usar
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={busyId !== null || !targetHeroId}
                            onClick={() => runAction(def.id, 'equip', targetHeroId)}
                            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-extrabold"
                          >
                            {busyId === `${def.id}-equip` ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Shield className="w-3.5 h-3.5" />
                            )}
                            Equipar
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {unlockedHeroes.some((h) => h.equippedItemIds.length > 0) && (
            <div className="space-y-2.5 pt-3 border-t border-[#745338]/70">
              <div className="text-xs font-extrabold uppercase tracking-wider text-[#f7dc94]">
                Equipados nos Heróis
              </div>
              <div className="space-y-2">
                {unlockedHeroes.map((hero) =>
                  hero.equippedItemIds.map((itemId) => {
                    const def = getItemDefinition(itemId);
                    if (!def) return null;
                    return (
                      <div
                        key={`${hero.id}-${itemId}`}
                        className="rpg-panel rounded-xl px-4 py-2.5 flex items-center justify-between gap-3"
                      >
                        <div className="flex items-center gap-3">
                          <ItemIcon itemId={def.id} size={36} />
                          <div>
                            <div className="text-xs font-extrabold text-amber-50">
                              {def.name} <span className="text-indigo-300 font-normal">em {hero.name}</span>
                            </div>
                            <div className="text-[11px] text-[#c9b29b]">{def.description}</div>
                          </div>
                        </div>
                        <button
                          type="button"
                          disabled={busyId !== null}
                          onClick={() => runAction(itemId, 'unequip', hero.id)}
                          className="px-3 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-bold text-amber-50"
                        >
                          Desequipar
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  Backpack,
  Coins,
  Compass,
  Heart,
  Lightbulb,
  Loader2,
  Lock,
  Menu,
  Music,
  RotateCcw,
  Shield,
  Swords,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { BossBattleArena } from '@/components/rpg/BossBattleArena';
import { EventAndChestModal } from '@/components/rpg/EventAndChestModal';
import { InventoryModal } from '@/components/rpg/InventoryModal';
import { PartyAndCheckpointModal } from '@/components/rpg/PartyAndCheckpointModal';
import { RegionMapCanvas } from '@/components/rpg/RegionMapCanvas';
import { RewardChestModal } from '@/components/rpg/RewardChestModal';
import { HeroSprite, ItemIcon } from '@/components/rpg/RpgArtwork';
import {
  RpgChallengeModal,
  type ActiveQuestionPayload,
  type SafeClientQuestion,
} from '@/components/rpg/RpgChallengeModal';
import { VisualNovelOverlay } from '@/components/rpg/VisualNovelOverlay';
import { getEventById } from '@/lib/rpg/data/events';
import { getRegionIntroDialogue } from '@/lib/rpg/data/dialogues';
import {
  getRpgMusicVolume,
  isRpgMusicEnabled,
  playRpgSfx,
  RPG_TRACK_LABELS,
  setRpgMusicEnabled,
  setRpgMusicVolume,
  startRpgMusic,
  stopRpgMusic,
  type RpgMusicTrack,
} from '@/lib/rpg/audio';
import { isRpgModuleEnabled } from '@/lib/rpg/feature-flag';
import { cn } from '@/lib/utils';
import type {
  RpgCampaignSnapshot,
  RpgEventDefinition,
  RpgMapNode,
  RpgRegionId,
  RpgStageEnemy,
} from '@/types/rpg';

function buildLocalStageEnemies(
  regionId: RpgRegionId,
  isElite: boolean,
  regionIndex: number,
  nodeLevel: number
): RpgStageEnemy[] {
  const levelStep = Math.max(0, nodeLevel - 2);
  const hpScale = regionIndex * 18 + levelStep * 5;
  const atkScale = regionIndex * 5 + Math.floor(levelStep * 1.5);
  const hasThirdEnemy = isElite || nodeLevel >= 6 || regionIndex >= 2;

  const roster: Record<
    RpgRegionId,
    Array<{ name: string; sprite: string; hpBase: number; atkBase: number; elite?: boolean }>
  > = {
    'gruta-esquecida': [
      { name: 'Slime da Caverna', sprite: 'slime.png', hpBase: 32, atkBase: 28 },
      { name: 'Morcego Sombrio', sprite: 'bat.png', hpBase: 28, atkBase: 30 },
      { name: 'Guardião da Gruta', sprite: 'guardian.png', hpBase: 46, atkBase: 34, elite: true },
    ],
    'caverna-assombrada': [
      { name: 'Esqueleto Guerreiro', sprite: 'skeleton.png', hpBase: 38, atkBase: 31 },
      { name: 'Morcego Sombrio', sprite: 'bat.png', hpBase: 32, atkBase: 30 },
      { name: 'Aranha Amaldiçoada', sprite: 'spider.png', hpBase: 50, atkBase: 36, elite: true },
    ],
    'caverna-de-fogo': [
      { name: 'Imp de Fogo', sprite: 'fire-imp.png', hpBase: 42, atkBase: 34 },
      { name: 'Aranha de Magma', sprite: 'spider.png', hpBase: 38, atkBase: 33 },
      { name: 'Besta das Cinzas', sprite: 'forest-beast.png', hpBase: 58, atkBase: 39, elite: true },
    ],
    'dungeon-de-gelo': [
      { name: 'Esqueleto Ártico', sprite: 'skeleton.png', hpBase: 46, atkBase: 36 },
      { name: 'Golem de Gelo', sprite: 'ice-golem.png', hpBase: 52, atkBase: 38 },
      { name: 'Guardião Glacial', sprite: 'guardian.png', hpBase: 66, atkBase: 42, elite: true },
    ],
  };

  const templates = roster[regionId] ?? roster['gruta-esquecida'];
  const selected = hasThirdEnemy ? templates : templates.slice(0, 2);

  return selected.map((t, idx) => {
    const eliteMult = isElite ? 1.2 : 1;
    const maxHp = Math.round((t.hpBase + hpScale) * eliteMult);
    const attackDamage = Math.round((t.atkBase + atkScale) * (isElite ? 1.12 : 1));
    return {
      id: `e${idx + 1}`,
      name: t.name,
      sprite: t.sprite,
      isElite: Boolean(t.elite || isElite),
      maxHp,
      currentHp: maxHp,
      attackDamage,
    };
  });
}

export default function RpgJornadaPage() {
  const enabled = isRpgModuleEnabled();
  const [snapshot, setSnapshot] = useState<RpgCampaignSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyNode, setBusyNode] = useState(false);

  const [musicOn, setMusicOn] = useState(false);
  const [musicVol, setMusicVol] = useState(0.35);

  const [activeQuestion, setActiveQuestion] = useState<ActiveQuestionPayload | null>(null);
  const [activeQuestionSyncPromise, setActiveQuestionSyncPromise] = useState<Promise<unknown> | undefined>(undefined);
  const [regionQuestionPool, setRegionQuestionPool] = useState<SafeClientQuestion[]>([]);
  const [activeEvent, setActiveEvent] = useState<{
    node: RpgMapNode;
    event?: RpgEventDefinition;
    chestReward?: { itemId: string; itemName: string; gold: number; xp: number };
  } | null>(null);
  const [partyModalMode, setPartyModalMode] = useState<'party' | 'checkpoint' | null>(null);
  const [showInventory, setShowInventory] = useState(false);
  const [showBossArena, setShowBossArena] = useState(false);
  const [pendingRewardChest, setPendingRewardChest] = useState<{
    nodeId: string;
    style: 'wood' | 'gold';
  } | null>(null);
  const [resetting, setResetting] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    setMusicOn(isRpgMusicEnabled());
    setMusicVol(getRpgMusicVolume());
    return () => {
      stopRpgMusic();
    };
  }, []);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    fetch('/api/rpg/campaign')
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Falha ao carregar Jornada do Herói.');
        setSnapshot(data);
        if (Array.isArray(data.regionQuestionPool)) {
          setRegionQuestionPool(data.regionQuestionPool);
        }
        if (data.activeBossBattle && data.activeBossBattle.status === 'in_progress') {
          setShowBossArena(true);
        }
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Erro ao iniciar módulo RPG.'))
      .finally(() => setLoading(false));
  }, [enabled]);

  const activeTrack: RpgMusicTrack =
    showBossArena && snapshot?.activeBossBattle
      ? 'boss'
      : activeQuestion
        ? 'battle'
        : (snapshot?.regions[snapshot.campaign.currentRegionIndex]?.id ?? 'gruta-esquecida');

  useEffect(() => {
    if (!snapshot) return;
    if (musicOn) startRpgMusic(activeTrack);
    else stopRpgMusic();
  }, [musicOn, activeTrack, snapshot]);

  const toggleMusic = () => {
    const next = !musicOn;
    setMusicOn(next);
    setRpgMusicEnabled(next);
    if (next) startRpgMusic(activeTrack);
    else stopRpgMusic();
  };

  if (!enabled) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-[#120d0c] text-amber-50 p-6">
        <div className="max-w-md text-center space-y-4 rpg-panel-gold rounded-3xl p-8">
          <Swords className="w-10 h-10 text-[#f5c451] mx-auto" />
          <h1 className="text-xl font-extrabold">Módulo RPG desabilitado</h1>
          <Link
            href="/"
            className="rpg-btn-gold inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-extrabold"
          >
            <ArrowLeft className="w-4 h-4" /> Voltar ao CPRE Studio
          </Link>
        </div>
      </div>
    );
  }

  if (loading || !snapshot) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center gap-3 bg-[#120d0c] text-amber-50">
        <Loader2 className="w-10 h-10 animate-spin text-[#f5c451]" />
        <p className="text-base font-bold">Carregando Jornada do Herói...</p>
        {error && <p className="text-xs text-rose-400 max-w-md text-center">{error}</p>}
      </div>
    );
  }

  const { campaign, regions, currentMap, heroes, inventory, activeBossBattle, pendingDialogue } =
    snapshot;
  const currentRegion = regions[campaign.currentRegionIndex] ?? regions[0];
  const equippedHeroes = heroes.filter((h) => h.isEquipped);
  const totalUnspentPoints = heroes.reduce((acc, h) => acc + h.unspentStatPoints, 0);
  const currentNode = currentMap.graph.nodes.find((n) => n.id === campaign.currentNodeId);
  const isAtCheckpoint = currentNode?.type === 'checkpoint';

  const partyHp = equippedHeroes.reduce((a, h) => a + h.currentHp, 0);
  const partyMaxHp = Math.max(1, equippedHeroes.reduce((a, h) => a + h.maxHp, 0));
  const partyHpPct = Math.round((partyHp / partyMaxHp) * 100);

  const handleDismissDialogue = () => {
    if (!pendingDialogue) return;
    const dialogueId = pendingDialogue.id;
    // Fecha diálogo em 0ms (Local-First) e sincroniza em background
    setSnapshot((prev) =>
      prev
        ? {
            ...prev,
            pendingDialogue: null,
            campaign: {
              ...prev.campaign,
              seenDialogueIds: prev.campaign.seenDialogueIds.includes(dialogueId)
                ? prev.campaign.seenDialogueIds
                : [...prev.campaign.seenDialogueIds, dialogueId],
            },
          }
        : prev
    );
    void fetch('/api/rpg/campaign', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'seen_dialogue', dialogueId }),
    });
  };

  const handleSwitchRegion = (regionIndex: number) => {
    if (regionIndex > campaign.unlockedRegionIndex || regionIndex === campaign.currentRegionIndex) return;
    setError(null);
    playRpgSfx('step');
    setShowBossArena(false);

    // Troca de mapa em 0ms usando os mapas já em memória + sync em background
    const targetMap = snapshot.regionMaps.find((m) => m.regionIndex === regionIndex);
    const targetRegion = regions[regionIndex];
    if (targetMap && targetRegion) {
      const nextCompleted =
        targetMap.completedNodeIds.length > 0 ? targetMap.completedNodeIds : [targetMap.graph.startNodeId];
      const lastCompleted = nextCompleted[nextCompleted.length - 1] ?? targetMap.graph.startNodeId;
      const introScene = getRegionIntroDialogue(targetRegion.id);
      setSnapshot((prev) =>
        prev
          ? {
              ...prev,
              campaign: {
                ...prev.campaign,
                currentRegionIndex: regionIndex,
                currentNodeId: lastCompleted,
              },
              currentMap: { ...targetMap, completedNodeIds: nextCompleted },
              pendingDialogue: prev.campaign.seenDialogueIds.includes(introScene.id) ? null : introScene,
            }
          : prev
      );
    }

    void fetch('/api/rpg/campaign', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'switch_region', regionIndex }),
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Não foi possível trocar de região.');
        if (Array.isArray(data.regionQuestionPool)) {
          setRegionQuestionPool(data.regionQuestionPool);
        }
        setSnapshot(data);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Não foi possível trocar de região.'));
  };

  const handleSelectNode = async (node: RpgMapNode) => {
    setError(null);
    playRpgSfx('step');

    // Atualiza posição do herói imediatamente (0ms)
    setSnapshot((prev) =>
      prev
        ? {
            ...prev,
            campaign: { ...prev.campaign, currentNodeId: node.id },
          }
        : prev
    );

    const syncNodeSelect = () =>
      fetch('/api/rpg/node/select', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nodeId: node.id }),
      }).then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Não foi possível acessar este nó.');
        if (data.snapshot) setSnapshot(data.snapshot);
        return data;
      });

    // 1. CHECKPOINT -> abre em 0ms + sync em background
    if (node.type === 'checkpoint') {
      playRpgSfx('heal_chime');
      setPartyModalMode('checkpoint');
      void syncNodeSelect().catch((e) => setError(e instanceof Error ? e.message : 'Erro ao sincronizar checkpoint.'));
      return;
    }

    // 2. EVENTO / GAP -> abre em 0ms + sync em background
    if (node.type === 'event' || node.type === 'gap') {
      const localEvent = getEventById(node.eventId ?? '');
      setActiveEvent({ node, event: localEvent });
      void syncNodeSelect().catch((e) => setError(e instanceof Error ? e.message : 'Erro ao sincronizar evento.'));
      return;
    }

    // 3. COMBATE (QUESTÃO / ELITE) -> abre em < 5ms usando o pool pré-carregado + sync em background!
    if ((node.type === 'question' || node.type === 'special') && regionQuestionPool.length > 0) {
      const firstQ =
        regionQuestionPool.find((q) => q.codigo === node.questionCodigo) ??
        regionQuestionPool[Math.floor(Math.random() * regionQuestionPool.length)];
      const localEncounter = {
        nodeId: node.id,
        status: 'in_progress' as const,
        phase: 'hero_turn' as const,
        attackingEnemyId: null,
        turnTimeLimitSec: null,
        turnStartedAt: null,
        turnNumber: 1,
        enemies: buildLocalStageEnemies(
          currentRegion.id,
          node.type === 'special',
          campaign.currentRegionIndex,
          node.level
        ),
        currentQuestionCodigo: firstQ.codigo,
        usedQuestionCodes: [firstQ.codigo],
      };

      const syncPromise = syncNodeSelect().catch((e) => {
        setError(e instanceof Error ? e.message : 'Erro ao sincronizar combate.');
      });
      setActiveQuestionSyncPromise(syncPromise);
      setActiveQuestion({
        node,
        question: firstQ,
        questionPool: regionQuestionPool,
        encounter: localEncounter,
      });
      return;
    }

    // 4. Fallback síncrono (Baú de mapa, Chefe, ou pool ainda vazio)
    setBusyNode(true);
    try {
      const data = await syncNodeSelect();
      if (node.type === 'question' || node.type === 'special') {
        setActiveQuestionSyncPromise(undefined);
        setActiveQuestion({
          node,
          question: data.question,
          questionPool: data.questionPool ?? regionQuestionPool,
          encounter: data.encounter,
        });
      } else if (node.type === 'chest') {
        playRpgSfx('chest_open');
        setActiveEvent({ node, chestReward: data.chestReward });
      } else if (node.type === 'boss') {
        setShowBossArena(true);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao avançar no mapa.');
    } finally {
      setBusyNode(false);
    }
  };

  const handleResetCampaign = async () => {
    if (!window.confirm('Reiniciar sua Jornada do Herói do zero?')) return;
    setResetting(true);
    setError(null);
    playRpgSfx('click');
    try {
      const res = await fetch('/api/rpg/campaign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reset' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao reiniciar jornada.');
      setActiveQuestion(null);
      setActiveEvent(null);
      setPendingRewardChest(null);
      setShowBossArena(false);
      setSnapshot(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao reiniciar jornada.');
    } finally {
      setResetting(false);
    }
  };

  const totalItemsCount = inventory.reduce((a, b) => a + b.quantity, 0);

  return (
    <div className="h-[100dvh] w-screen overflow-hidden flex flex-col bg-[#0c0910] text-amber-50">
      {/* HUD MOBILE COMPACTA (< md) com Barra Limpa + Menu Sanduíche */}
      <header className="md:hidden w-full shrink-0 z-30 bg-gradient-to-b from-[#261f26] to-[#161218] border-b-2 border-[#8f6b47] px-2.5 py-2 flex items-center justify-between gap-2 shadow-xl">
        {/* Esquerda: Herói ativo + Barra de HP do Grupo */}
        <button
          type="button"
          onClick={() => {
            playRpgSfx('click');
            setPartyModalMode(isAtCheckpoint ? 'checkpoint' : 'party');
          }}
          className="flex items-center gap-2 min-w-0"
          title="Gerenciar Heróis e Atributos"
        >
          <div className="relative shrink-0">
            <div className="w-10 h-10 rounded-xl border-2 border-[#d4a24c] bg-[#241c20] flex items-center justify-center overflow-hidden">
              {equippedHeroes[0] ? (
                <HeroSprite heroClassId={equippedHeroes[0].heroClassId} size={36} />
              ) : (
                <Shield className="w-4 h-4 text-[#f5c451]" />
              )}
            </div>
            {equippedHeroes.length > 1 && (
              <span className="absolute -bottom-1 -left-1 px-1 rounded bg-[#141016] border border-[#c9974b] text-[9px] font-black text-[#fde68a]">
                ×{equippedHeroes.length}
              </span>
            )}
            {totalUnspentPoints > 0 && (
              <span className="absolute -top-1.5 -right-1.5 px-1.5 py-0.2 rounded-full bg-[#f5c451] text-slate-950 text-[10px] font-black animate-bounce shadow">
                +{totalUnspentPoints}
              </span>
            )}
          </div>

          <div className="flex flex-col items-start min-w-0">
            <div className="flex items-center gap-1 w-24 sm:w-28 h-4 rounded-full bg-black/80 border border-[#8f6b47] overflow-hidden relative">
              <div
                className="h-full bg-gradient-to-r from-red-700 to-rose-500 transition-all duration-300"
                style={{ width: `${partyHpPct}%` }}
              />
              <span className="absolute inset-0 flex items-center justify-center text-[10px] font-extrabold text-white drop-shadow">
                <Heart className="w-2.5 h-2.5 text-rose-200 fill-rose-200 mr-1" />
                {partyHp}/{partyMaxHp}
              </span>
            </div>
            <div className="flex items-center gap-2 mt-0.5 text-[11px] font-extrabold">
              <span className="inline-flex items-center gap-0.5 text-[#fde68a]">
                <Lightbulb className="w-3 h-3 text-[#f5c451]" />
                {campaign.hintsRemaining}/{campaign.hintsMax}
              </span>
              <span className="inline-flex items-center gap-0.5 text-yellow-200">
                <Coins className="w-3 h-3 text-yellow-400" />
                {campaign.gold}
              </span>
            </div>
          </div>
        </button>

        {/* Direita: Mochila + Áudio rápido + Menu Sanduíche */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => {
              playRpgSfx('click');
              setShowInventory(true);
            }}
            className="rpg-btn-gold relative inline-flex items-center justify-center gap-1 px-2.5 py-2 rounded-xl text-xs font-extrabold"
            title="Abrir Mochila"
          >
            <Backpack className="w-4 h-4" />
            <span>{totalItemsCount}</span>
          </button>

          <button
            type="button"
            onClick={toggleMusic}
            title={musicOn ? 'Silenciar trilha' : 'Ativar trilha'}
            className="p-2 rounded-xl bg-[#110d13] border-2 border-[#6e523a] text-[#f5c451]"
          >
            {musicOn ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4 text-[#7c6a5c]" />}
          </button>

          <button
            type="button"
            onClick={() => {
              playRpgSfx('click');
              setMobileMenuOpen(true);
            }}
            aria-label="Abrir menu"
            className="p-2 rounded-xl bg-[#181318] border-2 border-[#c9974b] text-[#fde68a] active:scale-95 transition-transform"
          >
            <Menu className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* DRAWER SANDUÍCHE MOBILE */}
      {mobileMenuOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex justify-end">
          <button
            type="button"
            aria-label="Fechar menu"
            onClick={() => setMobileMenuOpen(false)}
            className="absolute inset-0 bg-black/75 backdrop-blur-xs"
          />
          <aside className="relative z-10 w-[82vw] max-w-xs h-full bg-gradient-to-b from-[#231b24] to-[#120e16] border-l-2 border-[#c9974b] shadow-2xl flex flex-col overflow-y-auto animate-card-enter">
            {/* Cabeçalho Drawer */}
            <div className="px-4 py-3.5 border-b border-[#6e523a] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Compass className="w-5 h-5 text-[#f5c451]" />
                <span className="text-sm font-extrabold uppercase tracking-wider text-[#fde68a]">
                  Jornada do Herói
                </span>
              </div>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="p-1.5 rounded-lg bg-[#141016] border border-[#745338] text-[#e5d5c5]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 space-y-5 flex-1">
              {/* Grupo de Heróis */}
              <div className="space-y-2">
                <div className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-[#c9b29b]">
                  Grupo de Heróis
                </div>
                <button
                  type="button"
                  onClick={() => {
                    playRpgSfx('click');
                    setMobileMenuOpen(false);
                    setPartyModalMode(isAtCheckpoint ? 'checkpoint' : 'party');
                  }}
                  className="w-full p-2.5 rounded-xl bg-[#16111a] border-2 border-[#745338] flex items-center justify-between gap-2 text-left"
                >
                  <div className="flex items-center gap-1.5">
                    {[0, 1, 2].map((slotIdx) => {
                      const hero = equippedHeroes[slotIdx];
                      return (
                        <div
                          key={slotIdx}
                          className={cn(
                            'w-10 h-10 rounded-lg border flex items-center justify-center overflow-hidden',
                            hero
                              ? 'bg-[#241c20] border-[#d4a24c]'
                              : 'bg-[#120e14] border-[#4a3b34]/60'
                          )}
                        >
                          {hero ? (
                            <HeroSprite heroClassId={hero.heroClassId} size={36} />
                          ) : (
                            <Lock className="w-3.5 h-3.5 text-[#5c4e46]" />
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <div className="text-right">
                    <div className="text-xs font-extrabold text-amber-50">Gerenciar</div>
                    {totalUnspentPoints > 0 ? (
                      <div className="text-[11px] font-black text-[#f5c451]">
                        +{totalUnspentPoints} pts
                      </div>
                    ) : (
                      <div className="text-[10px] text-[#c9b29b]">Atributos</div>
                    )}
                  </div>
                </button>
              </div>

              {/* Regiões da Campanha */}
              <div className="space-y-2">
                <div className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-[#c9b29b]">
                  Regiões do Mapa
                </div>
                <div className="space-y-1.5">
                  {regions.map((reg) => {
                    const isUnlocked = reg.index <= campaign.unlockedRegionIndex;
                    const isCurrent = reg.index === campaign.currentRegionIndex;
                    return (
                      <button
                        key={reg.id}
                        type="button"
                        disabled={!isUnlocked}
                        onClick={() => {
                          void handleSwitchRegion(reg.index);
                          setMobileMenuOpen(false);
                        }}
                        className={cn(
                          'w-full px-3 py-2.5 rounded-xl border text-left flex items-center justify-between transition-all',
                          isCurrent && 'bg-[#c9974b] border-[#fde68a] text-[#1a110a] font-black',
                          !isCurrent &&
                            isUnlocked &&
                            'bg-[#16111a] border-[#6e523a] text-[#e5d5c5] font-bold',
                          !isUnlocked &&
                            'bg-[#110d14] border-[#382d2a] text-[#6c5e54] cursor-not-allowed'
                        )}
                      >
                        <div>
                          <div className="text-xs leading-tight">{reg.name}</div>
                          <div
                            className={cn(
                              'text-[10px] mt-0.5',
                              isCurrent ? 'text-[#2b1d12]' : 'text-[#9e8b7a]'
                            )}
                          >
                            Níveis {reg.levelRange[0]}–{reg.levelRange[1]}
                          </div>
                        </div>
                        {!isUnlocked ? (
                          <Lock className="w-3.5 h-3.5 shrink-0" />
                        ) : isCurrent ? (
                          <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-black/20">
                            Atual
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Trilha Sonora */}
              <div className="space-y-2">
                <div className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-[#c9b29b]">
                  Trilha Sonora
                </div>
                <div className="p-3 rounded-xl bg-[#16111a] border border-[#6e523a] space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <Music className="w-4 h-4 text-[#f5c451] shrink-0" />
                      <span className="text-xs font-bold text-amber-100 truncate">
                        {RPG_TRACK_LABELS[activeTrack]}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={toggleMusic}
                      className={cn(
                        'px-2.5 py-1 rounded-lg text-[11px] font-extrabold border',
                        musicOn
                          ? 'bg-emerald-950 border-emerald-400 text-emerald-200'
                          : 'bg-[#211a24] border-[#6e523a] text-[#c9b29b]'
                      )}
                    >
                      {musicOn ? 'Ligada' : 'Desligada'}
                    </button>
                  </div>
                  {musicOn && (
                    <input
                      type="range"
                      min={0.05}
                      max={1}
                      step={0.05}
                      value={musicVol}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        setMusicVol(v);
                        setRpgMusicVolume(v);
                      }}
                      aria-label="Volume"
                      className="w-full accent-[#f5c451] cursor-pointer"
                    />
                  )}
                </div>
              </div>
            </div>

            {/* Rodapé Drawer: Reiniciar e Voltar */}
            <div className="p-4 border-t border-[#6e523a] space-y-2 bg-[#120e16]">
              <button
                type="button"
                disabled={resetting}
                onClick={() => {
                  setMobileMenuOpen(false);
                  void handleResetCampaign();
                }}
                className="w-full py-2.5 px-3 rounded-xl bg-rose-950/80 border border-rose-500/60 text-rose-200 text-xs font-extrabold flex items-center justify-center gap-2 disabled:opacity-40"
              >
                <RotateCcw className={cn('w-4 h-4', resetting && 'animate-spin')} />
                Reiniciar Jornada do Zero
              </button>
              <Link
                href="/"
                onClick={() => {
                  stopRpgMusic();
                  setMobileMenuOpen(false);
                }}
                className="w-full py-2.5 px-3 rounded-xl bg-[#181318] border border-[#745338] text-[#e5d5c5] text-xs font-extrabold flex items-center justify-center gap-2"
              >
                <ArrowLeft className="w-4 h-4" />
                Voltar ao CPRE Studio
              </Link>
            </div>
          </aside>
        </div>
      )}

      {/* HUD Superior Desktop Grande Full-Width (md+) */}
      <header className="hidden md:flex w-full shrink-0 z-30 bg-gradient-to-b from-[#261f26] to-[#161218] border-b-2 border-[#8f6b47] px-4 sm:px-6 py-2.5 flex-wrap items-center justify-between gap-3 shadow-2xl">
        {/* Esquerda: Voltar + 3 Slots de Heróis + Barra de HP Grande */}
        <div className="flex items-center gap-3">
          <Link
            href="/"
            onClick={() => stopRpgMusic()}
            title="Voltar ao CPRE Studio"
            className="p-2.5 rounded-xl bg-[#181318] border-2 border-[#745338] hover:border-[#f5c451] text-[#e5d5c5] hover:text-white transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>

          <button
            type="button"
            onClick={() => {
              playRpgSfx('click');
              setPartyModalMode(isAtCheckpoint ? 'checkpoint' : 'party');
            }}
            title="Gerenciar Heróis e Atributos"
            className="flex items-center gap-1.5 relative group"
          >
            {[0, 1, 2].map((slotIdx) => {
              const hero = equippedHeroes[slotIdx];
              return (
                <div
                  key={slotIdx}
                  className={cn(
                    'w-12 h-12 rounded-xl border-2 flex items-center justify-center overflow-hidden transition-colors',
                    hero
                      ? 'bg-[#241c20] border-[#d4a24c] group-hover:border-[#fde68a]'
                      : 'bg-[#141016] border-[#4a3b34]/60'
                  )}
                >
                  {hero ? (
                    <HeroSprite heroClassId={hero.heroClassId} size={44} />
                  ) : (
                    <Lock className="w-4 h-4 text-[#5c4e46]" />
                  )}
                </div>
              );
            })}
            {totalUnspentPoints > 0 && (
              <span className="absolute -top-2 -right-2 px-2 py-0.5 rounded-full bg-[#f5c451] text-slate-950 text-xs font-black animate-bounce shadow">
                +{totalUnspentPoints}
              </span>
            )}
          </button>

          <div className="hidden sm:flex items-center gap-2.5 px-3 py-1.5 rounded-xl bg-[#110d13] border-2 border-[#6e523a]">
            <Heart className="w-5 h-5 text-rose-500 fill-rose-500 shrink-0" />
            <div className="w-36 h-5 rounded-full bg-black/80 border border-[#8f6b47] overflow-hidden relative">
              <div
                className="h-full bg-gradient-to-r from-red-700 to-rose-500 transition-all duration-300"
                style={{ width: `${partyHpPct}%` }}
              />
              <span className="absolute inset-0 flex items-center justify-center text-xs font-extrabold text-white drop-shadow">
                {partyHp} / {partyMaxHp}
              </span>
            </div>
          </div>
        </div>

        {/* Centro: Dicas + Ouro + Seletor de Regiões */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div
            className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-[#110d13] border-2 border-[#c9974b]/75 text-sm font-extrabold text-[#fde68a]"
            title="Dicas compartilhadas do grupo"
          >
            <Lightbulb className="w-4 h-4 text-[#f5c451]" />
            {campaign.hintsRemaining}/{campaign.hintsMax}
          </div>

          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-[#110d13] border-2 border-yellow-500/55 text-sm font-extrabold text-yellow-200">
            <Coins className="w-4 h-4 text-yellow-400" />
            {campaign.gold}
          </div>

          <div className="hidden lg:flex items-center gap-1 bg-[#110d13] p-1 rounded-xl border-2 border-[#6e523a]">
            {regions.map((reg) => {
              const isUnlocked = reg.index <= campaign.unlockedRegionIndex;
              const isCurrent = reg.index === campaign.currentRegionIndex;
              return (
                <button
                  key={reg.id}
                  type="button"
                  disabled={!isUnlocked}
                  onClick={() => handleSwitchRegion(reg.index)}
                  className={cn(
                    'px-3 py-1.5 rounded-lg text-xs font-extrabold transition-all inline-flex items-center gap-1.5',
                    isCurrent && 'bg-[#c9974b] text-[#1a110a]',
                    !isCurrent && isUnlocked && 'text-[#e5d5c5] hover:bg-white/10',
                    !isUnlocked && 'text-[#6c5e54] cursor-not-allowed'
                  )}
                >
                  {!isUnlocked && <Lock className="w-3 h-3" />}
                  {reg.name}
                </button>
              );
            })}
          </div>
        </div>

        {/* Direita: Atalhos de Itens + Mochila + Música + Reset */}
        <div className="flex items-center gap-2">
          <div className="hidden md:flex items-center gap-1.5">
            {inventory.slice(0, 3).map((entry) => (
              <button
                key={entry.id}
                type="button"
                onClick={() => {
                  playRpgSfx('click');
                  setShowInventory(true);
                }}
                className="w-11 h-11 rounded-xl bg-[#110d13] border-2 border-[#745338] hover:border-[#f5c451] flex items-center justify-center relative"
              >
                <ItemIcon itemId={entry.itemId} size={34} />
                <span className="absolute -bottom-1 -right-1 px-1.5 rounded bg-black/95 text-[10px] font-extrabold text-[#fde68a]">
                  {entry.quantity}
                </span>
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => {
              playRpgSfx('click');
              setShowInventory(true);
            }}
            className="rpg-btn-gold inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-extrabold"
          >
            <Backpack className="w-4 h-4" />
            Mochila ({inventory.reduce((a, b) => a + b.quantity, 0)})
          </button>

          <div className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-[#110d13] border-2 border-[#6e523a]">
            <button
              type="button"
              onClick={toggleMusic}
              title={RPG_TRACK_LABELS[activeTrack]}
              className="text-[#f5c451] hover:text-white inline-flex items-center gap-1"
            >
              {musicOn ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4 text-[#7c6a5c]" />}
              <Music className="w-4 h-4" />
            </button>
            {musicOn && (
              <input
                type="range"
                min={0.05}
                max={1}
                step={0.05}
                value={musicVol}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setMusicVol(v);
                  setRpgMusicVolume(v);
                }}
                aria-label="Volume"
                className="w-16 accent-[#f5c451] cursor-pointer hidden xl:block"
              />
            )}
          </div>

          <button
            type="button"
            disabled={resetting}
            onClick={handleResetCampaign}
            title="Reiniciar Jornada do Zero"
            className="p-2.5 rounded-xl bg-rose-950/80 hover:bg-rose-900 border-2 border-rose-500/60 text-rose-200 disabled:opacity-40"
          >
            <RotateCcw className={cn('w-4 h-4', resetting && 'animate-spin')} />
          </button>
        </div>
      </header>

      {error && (
        <div className="shrink-0 bg-rose-950/90 border-b border-rose-500 px-5 py-2 text-xs text-rose-100 text-center">
          {error}
        </div>
      )}

      {/* Área Principal 100% Full Screen (zero sobras!) */}
      <main className="flex-1 min-h-0 w-full relative overflow-hidden">
        {showBossArena && activeBossBattle ? (
          <div className="w-full h-full overflow-y-auto p-4 sm:p-6 bg-[#0d0a10]">
            <div className="max-w-6xl mx-auto">
              <BossBattleArena
                battle={activeBossBattle}
                equippedHeroes={equippedHeroes}
                hintsRemaining={campaign.hintsRemaining}
                onSnapshotUpdate={setSnapshot}
                onExitArena={() => setShowBossArena(false)}
              />
            </div>
          </div>
        ) : (
          <RegionMapCanvas
            region={currentRegion}
            regionMap={currentMap}
            currentNodeId={campaign.currentNodeId}
            onSelectNode={handleSelectNode}
            disabled={busyNode}
          />
        )}
      </main>

      {pendingDialogue && (
        <VisualNovelOverlay scene={pendingDialogue} onComplete={handleDismissDialogue} />
      )}

      {activeQuestion && (
        <RpgChallengeModal
          payload={activeQuestion}
          region={currentRegion}
          equippedHeroes={equippedHeroes}
          activeEffects={campaign.activeEffects}
          hintsRemaining={campaign.hintsRemaining}
          gold={campaign.gold}
          inventory={inventory}
          initialSyncPromise={activeQuestionSyncPromise}
          onSnapshotUpdate={setSnapshot}
          onOpenRewardChest={(nodeId, style) => {
            setActiveQuestion(null);
            setPendingRewardChest({ nodeId, style });
          }}
          onClose={() => setActiveQuestion(null)}
        />
      )}

      {pendingRewardChest && (
        <RewardChestModal
          nodeId={pendingRewardChest.nodeId}
          chestStyle={pendingRewardChest.style}
          onSnapshotUpdate={setSnapshot}
          onClose={() => setPendingRewardChest(null)}
        />
      )}

      {activeEvent && (
        <EventAndChestModal
          node={activeEvent.node}
          event={activeEvent.event}
          chestReward={activeEvent.chestReward}
          onSnapshotUpdate={setSnapshot}
          onClose={() => setActiveEvent(null)}
        />
      )}

      {partyModalMode && (
        <PartyAndCheckpointModal
          heroes={heroes}
          isAtCheckpoint={isAtCheckpoint}
          mode={partyModalMode}
          onSnapshotUpdate={setSnapshot}
          onClose={() => setPartyModalMode(null)}
        />
      )}

      {showInventory && (
        <InventoryModal
          inventory={inventory}
          heroes={heroes}
          onSnapshotUpdate={setSnapshot}
          onClose={() => setShowInventory(false)}
        />
      )}
    </div>
  );
}

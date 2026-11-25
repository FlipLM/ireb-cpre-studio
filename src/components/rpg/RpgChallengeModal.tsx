'use client';

import { memo, useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  Clock,
  Coins,
  Crosshair,
  Flame,
  Gift,
  Heart,
  Lightbulb,
  Loader2,
  Shield,
  Skull,
  Sparkles,
  X,
  XCircle,
} from 'lucide-react';
import { QuestionImageViewer } from '@/components/QuestionImageViewer';
import {
  HeroSprite,
  ItemIcon,
  VfxBurst,
  type RpgVfxType,
  type SpriteAnimState,
} from '@/components/rpg/RpgArtwork';
import { evaluateAnswer } from '@/lib/evaluation';
import { playRpgSfx } from '@/lib/rpg/audio';
import { RPG_BALANCE, scaleXpByRegion } from '@/lib/rpg/balance';
import { getItemDefinition } from '@/lib/rpg/data/items';
import {
  calculateBossCounterAttack,
  calculateBossDamage,
  computeEffectivePartyStats,
} from '@/lib/rpg/engine/combat';
import { playSound } from '@/lib/sounds';
import { cn } from '@/lib/utils';
import type {
  RpgActiveTempEffect,
  RpgCampaignSnapshot,
  RpgHeroState,
  RpgInventoryEntry,
  RpgMapNode,
  RpgRegionConfig,
  RpgStageEncounterState,
} from '@/types/rpg';

export interface SafeClientQuestion {
  codigo: string;
  numero: number;
  enunciado: string;
  tipo: 'unica' | 'multipla';
  quantidade_respostas: string;
  alternativas: Record<string, string>;
  managedImageUrl: string | null;
  correctAnswers?: string[];
  explanation?: string;
}

export interface ActiveQuestionPayload {
  node: RpgMapNode;
  question: SafeClientQuestion;
  questionPool?: SafeClientQuestion[];
  encounter: RpgStageEncounterState;
}

/**
 * Cronômetro isolado para o ENEMY TURN: evita re-renderizar o modal inteiro
 * (sprites e botões de alternativa) a cada 150ms.
 */
const EnemyTurnTimer = memo(function EnemyTurnTimer({
  timeLimitSec,
  turnKey,
  onTimeout,
}: {
  timeLimitSec: number;
  turnKey: number;
  onTimeout: () => void;
}) {
  const [secondsLeft, setSecondsLeft] = useState<number>(timeLimitSec);
  const timeoutFiredRef = useRef(false);
  const lastTickSecRef = useRef<number>(-1);
  const onTimeoutRef = useRef(onTimeout);
  onTimeoutRef.current = onTimeout;

  useEffect(() => {
    const startMs = Date.now();
    setSecondsLeft(timeLimitSec);
    timeoutFiredRef.current = false;
    lastTickSecRef.current = -1;

    const interval = window.setInterval(() => {
      const elapsed = (Date.now() - startMs) / 1000;
      const rem = Math.max(0, timeLimitSec - elapsed);
      setSecondsLeft(rem);

      const ceilSec = Math.ceil(rem);
      if (ceilSec > 0 && ceilSec <= 5 && ceilSec !== lastTickSecRef.current) {
        lastTickSecRef.current = ceilSec;
        playSound('tick');
      }

      if (rem <= 0 && !timeoutFiredRef.current) {
        timeoutFiredRef.current = true;
        window.clearInterval(interval);
        onTimeoutRef.current();
      }
    }, 150);

    return () => window.clearInterval(interval);
  }, [timeLimitSec, turnKey]);

  return (
    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-lg bg-[#1c1016] border border-rose-500/80 text-xs font-black text-rose-200">
      <Clock className="w-3.5 h-3.5 text-rose-400" />
      <span>{Math.ceil(secondsLeft)}s</span>
      <div className="w-24 h-2 rounded-full bg-black/80 overflow-hidden">
        <div
          className={cn(
            'h-full transition-all duration-150',
            secondsLeft <= 5 ? 'bg-rose-500' : 'bg-amber-400'
          )}
          style={{ width: `${Math.max(0, (secondsLeft / timeLimitSec) * 100)}%` }}
        />
      </div>
    </div>
  );
});

/**
 * Arena de Combate Proporcional estilo Indie Pixel-Art RPG:
 * Centralizada em 1060px (sem esticar em monitores largos), com heróis e inimigos
 * grandes frente a frente, barras de HP sobre as cabeças, HERO TURN, VFX e painel
 * medieval de desafio integrado na base.
 */
export function RpgChallengeModal({
  payload,
  region,
  equippedHeroes,
  activeEffects = [],
  hintsRemaining,
  gold,
  inventory,
  initialSyncPromise,
  onSnapshotUpdate,
  onOpenRewardChest,
  onClose,
}: {
  payload: ActiveQuestionPayload;
  region: RpgRegionConfig;
  equippedHeroes: RpgHeroState[];
  activeEffects?: RpgActiveTempEffect[];
  hintsRemaining: number;
  gold: number;
  inventory: RpgInventoryEntry[];
  initialSyncPromise?: Promise<unknown>;
  onSnapshotUpdate: (snapshot: RpgCampaignSnapshot) => void;
  onOpenRewardChest: (nodeId: string, style: 'wood' | 'gold') => void;
  onClose: () => void;
}) {
  const { node } = payload;
  const [encounter, setEncounter] = useState<RpgStageEncounterState>(payload.encounter);
  const [question, setQuestion] = useState<SafeClientQuestion>(payload.question);
  const [localHeroes, setLocalHeroes] = useState<RpgHeroState[]>(equippedHeroes);
  const questionPoolRef = useRef<SafeClientQuestion[]>(payload.questionPool ?? []);
  const syncQueueRef = useRef<Promise<unknown>>(initialSyncPromise ?? Promise.resolve());
  const [waitingChestSync, setWaitingChestSync] = useState(false);

  useEffect(() => {
    setLocalHeroes(equippedHeroes);
  }, [equippedHeroes]);

  const [targetEnemyId, setTargetEnemyId] = useState<string>(
    payload.encounter.enemies.find((e) => e.currentHp > 0)?.id ?? payload.encounter.enemies[0]?.id ?? 'e1'
  );

  const [selected, setSelected] = useState<string[]>([]);
  const [eliminated, setEliminated] = useState<string[]>([]);
  const [hintText, setHintText] = useState<string | null>(null);
  const [hintSources, setHintSources] = useState<Array<{ id: string; eu: string; title: string }>>([]);
  const [loadingHint, setLoadingHint] = useState(false);
  const [loadingElim, setLoadingElim] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [heroAnim, setHeroAnim] = useState<SpriteAnimState>('idle');
  const [hitEnemyId, setHitEnemyId] = useState<string | null>(null);
  const [screenShake, setScreenShake] = useState(false);
  const [vfx, setVfx] = useState<{ target: 'enemy' | 'hero'; type: RpgVfxType; key: number } | null>(null);
  const [dmgPopup, setDmgPopup] = useState<{
    key: number;
    text: string;
    tone: 'crit' | 'hit' | 'parry' | 'bad';
  } | null>(null);

  const [turnResult, setTurnResult] = useState<{
    isCorrect: boolean;
    wasEnemyTurn: boolean;
    attackBlocked: boolean;
    timedOut: boolean;
    correctAnswers: string[];
    explanation: string;
    damageDealt: number;
    isCritical: boolean;
    targetEnemyName: string | null;
    parriedByHeroName: string | null;
    xpAwarded: number;
    hpPenalty: number;
    goldAwarded: number;
    encounterStatus: 'in_progress' | 'victory' | 'defeat';
    nextQuestion: SafeClientQuestion | null;
    rewardChestAvailable: boolean;
    rewardChestStyle: 'wood' | 'gold';
  } | null>(null);

  const isEnemyTurn = encounter.phase === 'enemy_turn';
  const timeLimitSec = encounter.turnTimeLimitSec ?? 20;

  const elimItems = inventory.filter((entry) => {
    const def = getItemDefinition(entry.itemId);
    return def?.category === 'eliminate_option' && !entry.equippedByHeroId && entry.quantity > 0;
  });

  const activeTargetId =
    encounter.enemies.find((e) => e.id === targetEnemyId && e.currentHp > 0)?.id ??
    encounter.enemies.find((e) => e.currentHp > 0)?.id ??
    '';

  const partyHp = localHeroes.reduce((a, h) => a + h.currentHp, 0);
  const partyMaxHp = Math.max(1, localHeroes.reduce((a, h) => a + h.maxHp, 0));
  const partyHpPct = Math.round((partyHp / partyMaxHp) * 100);

  const toggleOption = (letter: string) => {
    if (turnResult || eliminated.includes(letter)) return;
    playRpgSfx('click');
    if (question.tipo === 'unica') {
      setSelected([letter]);
    } else {
      setSelected((prev) =>
        prev.includes(letter) ? prev.filter((x) => x !== letter) : [...prev, letter]
      );
    }
  };

  const handleUseHint = async () => {
    setLoadingHint(true);
    setError(null);
    try {
      const res = await fetch('/api/rpg/challenge/hint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questionCodigo: question.codigo }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao obter dica.');
      playRpgSfx('hint_sparkle');
      setHintText(data.hint);
      setHintSources(data.sources ?? []);
      onSnapshotUpdate(data.snapshot);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao usar dica.');
    } finally {
      setLoadingHint(false);
    }
  };

  const handleEliminate = async (itemId: string) => {
    setLoadingElim(itemId);
    setError(null);
    try {
      const res = await fetch('/api/rpg/challenge/eliminate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itemId,
          questionCodigo: question.codigo,
          alreadyEliminated: eliminated,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Não foi possível usar o item.');
      playRpgSfx('eliminate_poof');
      setEliminated(data.allEliminated);
      setSelected((prev) => prev.filter((x) => !data.allEliminated.includes(x)));
      onSnapshotUpdate(data.snapshot);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao usar item.');
    } finally {
      setLoadingElim(null);
    }
  };

  const playTurnFx = (data: {
    attackBlocked: boolean;
    isCorrect: boolean;
    isCritical: boolean;
    damageDealt: number;
    parriedByHeroName: string | null;
    timedOut: boolean;
    hpPenalty: number;
    encounterStatus: 'in_progress' | 'victory' | 'defeat';
  }) => {
    const key = Date.now();
    if (data.attackBlocked) {
      setHeroAnim('parry');
      setVfx({ target: 'hero', type: 'parry', key });
      setDmgPopup({ key, text: 'ATAQUE BLOQUEADO!', tone: 'parry' });
      playRpgSfx('parry_clang');
    } else if (data.isCorrect) {
      setHeroAnim('attack');
      setHitEnemyId(activeTargetId);
      setVfx({ target: 'enemy', type: data.isCritical ? 'crit' : 'slash', key });
      setDmgPopup({
        key,
        text: data.isCritical ? `-${data.damageDealt} CRÍTICO!` : `-${data.damageDealt}`,
        tone: data.isCritical ? 'crit' : 'hit',
      });
      if (data.isCritical) {
        setScreenShake(true);
        playRpgSfx('crit_boom');
      } else {
        playRpgSfx('sword_hit');
      }
      if (data.encounterStatus === 'victory') {
        window.setTimeout(() => playRpgSfx('victory_fanfare'), 380);
      }
    } else if (data.parriedByHeroName) {
      setHeroAnim('parry');
      setVfx({ target: 'hero', type: 'parry', key });
      setDmgPopup({ key, text: `PARRY! (${data.parriedByHeroName})`, tone: 'parry' });
      playRpgSfx('parry_clang');
    } else {
      setHeroAnim('hit');
      setScreenShake(true);
      setVfx({ target: 'hero', type: 'dark', key });
      setDmgPopup({
        key,
        text: data.timedOut ? `TEMPO ESGOTADO! -${data.hpPenalty} HP` : `-${data.hpPenalty} HP`,
        tone: 'bad',
      });
      playRpgSfx(data.encounterStatus === 'defeat' ? 'defeat_chord' : 'boss_hit');
    }

    window.setTimeout(() => {
      setScreenShake(false);
      setHitEnemyId(null);
      setHeroAnim(
        data.encounterStatus === 'victory'
          ? 'victory'
          : data.encounterStatus === 'defeat'
            ? 'defeat'
            : 'idle'
      );
    }, 650);
  };

  const submitAnswer = async (timedOut = false) => {
    if (!timedOut && selected.length === 0) return;
    if (submitting || turnResult) return;

    const chosenAnswers = timedOut ? [] : [...selected];
    const targetId = activeTargetId || undefined;

    // CAMINHO ULTRA-RÁPIDO LOCAL-FIRST (< 10ms): avalia no cliente e sincroniza no Supabase em background!
    if (question.correctAnswers && question.explanation) {
      const nextEncounter: RpgStageEncounterState = {
        ...encounter,
        enemies: encounter.enemies.map((e) => ({ ...e })),
        usedQuestionCodes: [...encounter.usedQuestionCodes],
      };
      const nextHeroes = localHeroes.map((h) => ({ ...h }));
      const wasEnemyTurn = nextEncounter.phase === 'enemy_turn';
      const isSpecial = node.type === 'special';
      const evalRes = timedOut
        ? { isCorrect: false, normalizedSelected: [] as string[], normalizedCorrect: question.correctAnswers }
        : evaluateAnswer(chosenAnswers, question.correctAnswers);
      const partyStats = computeEffectivePartyStats(nextHeroes, activeEffects);

      let damageDealt = 0;
      let isCritical = false;
      let targetEnemyName: string | null = null;
      let parriedByHeroName: string | null = null;
      let attackBlocked = false;
      let hpPenalty = 0;
      let xpAwarded = 0;
      let goldAwarded = 0;

      if (wasEnemyTurn) {
        const attacker =
          nextEncounter.enemies.find((e) => e.id === nextEncounter.attackingEnemyId && e.currentHp > 0) ??
          nextEncounter.enemies.find((e) => e.currentHp > 0);
        targetEnemyName = attacker?.name ?? null;
        if (evalRes.isCorrect && !timedOut) {
          attackBlocked = true;
        } else {
          const rawAtk = attacker?.attackDamage ?? 30;
          const counter = timedOut
            ? { parried: false, parriedByHeroName: null, damageTakenPerHero: Math.max(12, rawAtk - partyStats.totalDefense) }
            : calculateBossCounterAttack({
                bossAttackDamage: rawAtk,
                equippedHeroes: nextHeroes,
                activeEffects,
              });
          if (counter.parried) {
            parriedByHeroName = counter.parriedByHeroName;
          } else {
            hpPenalty = counter.damageTakenPerHero;
            for (const h of nextHeroes) h.currentHp = Math.max(0, h.currentHp - hpPenalty);
          }
        }
      } else if (evalRes.isCorrect) {
        const target =
          nextEncounter.enemies.find((e) => e.id === targetId && e.currentHp > 0) ??
          nextEncounter.enemies.find((e) => e.currentHp > 0);
        if (target) {
          const hit = calculateBossDamage({ score: 1, classification: 'correct', partyStats });
          damageDealt = hit.damage;
          isCritical = hit.isCritical;
          targetEnemyName = target.name;
          target.currentHp = Math.max(0, target.currentHp - damageDealt);
        }
      } else {
        const aliveEnemies = nextEncounter.enemies.filter((e) => e.currentHp > 0);
        const avgAtk = Math.round(
          aliveEnemies.reduce((acc, e) => acc + e.attackDamage, 0) / Math.max(1, aliveEnemies.length)
        );
        const counter = calculateBossCounterAttack({
          bossAttackDamage: avgAtk,
          equippedHeroes: nextHeroes,
          activeEffects,
        });
        if (counter.parried) {
          parriedByHeroName = counter.parriedByHeroName;
        } else {
          hpPenalty = counter.damageTakenPerHero;
          for (const h of nextHeroes) h.currentHp = Math.max(0, h.currentHp - hpPenalty);
        }
      }

      const allEnemiesDead = nextEncounter.enemies.every((e) => e.currentHp <= 0);
      const allHeroesDead = nextHeroes.every((h) => h.currentHp <= 0);
      let nextQ: SafeClientQuestion | null = null;

      if (allEnemiesDead) {
        nextEncounter.status = 'victory';
        nextEncounter.phase = 'hero_turn';
        nextEncounter.attackingEnemyId = null;
        nextEncounter.turnTimeLimitSec = null;
        xpAwarded = scaleXpByRegion(
          isSpecial ? RPG_BALANCE.xp.rewards.specialCorrect : RPG_BALANCE.xp.rewards.questionCorrect,
          region.index
        );
        goldAwarded = isSpecial ? 30 : 15;
      } else if (allHeroesDead) {
        nextEncounter.status = 'defeat';
        nextEncounter.phase = 'hero_turn';
        nextEncounter.attackingEnemyId = null;
        nextEncounter.turnTimeLimitSec = null;
      } else {
        nextEncounter.turnNumber += 1;
        const usedSet = new Set(nextEncounter.usedQuestionCodes);
        const candidate =
          questionPoolRef.current.find((q) => !usedSet.has(q.codigo)) ??
          questionPoolRef.current[0] ??
          null;
        if (candidate) {
          nextQ = candidate;
          nextEncounter.currentQuestionCodigo = candidate.codigo;
          nextEncounter.usedQuestionCodes.push(candidate.codigo);
        }
        const alive = nextEncounter.enemies.filter((e) => e.currentHp > 0);
        if (!wasEnemyTurn && alive.length > 0) {
          const attacker = alive[(nextEncounter.turnNumber - 1) % alive.length];
          nextEncounter.phase = 'enemy_turn';
          nextEncounter.attackingEnemyId = attacker.id;
          const baseLim = isSpecial ? 18 : 22;
          nextEncounter.turnTimeLimitSec = Math.max(
            12,
            baseLim - region.index * 2 - (node.level >= 7 ? 2 : 0)
          );
          nextEncounter.turnStartedAt = new Date().toISOString();
        } else {
          nextEncounter.phase = 'hero_turn';
          nextEncounter.attackingEnemyId = null;
          nextEncounter.turnTimeLimitSec = null;
          nextEncounter.turnStartedAt = null;
        }
      }

      const localResult = {
        isCorrect: evalRes.isCorrect,
        wasEnemyTurn,
        attackBlocked,
        timedOut,
        correctAnswers: evalRes.normalizedCorrect,
        explanation: question.explanation,
        damageDealt,
        isCritical,
        targetEnemyName,
        parriedByHeroName,
        xpAwarded,
        hpPenalty,
        goldAwarded,
        encounterStatus: nextEncounter.status,
        nextQuestion: nextQ,
        rewardChestAvailable: nextEncounter.status === 'victory',
        rewardChestStyle: (isSpecial ? 'gold' : 'wood') as 'wood' | 'gold',
      };

      setLocalHeroes(nextHeroes);
      setEncounter(nextEncounter);
      setTurnResult(localResult);
      playTurnFx(localResult);

      // Sincroniza no Supabase em fila ordenada em background (0ms de espera na UI!)
      syncQueueRef.current = syncQueueRef.current
        .then(async () => {
          const res = await fetch('/api/rpg/challenge/answer', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              nodeId: node.id,
              selectedAnswers: chosenAnswers,
              targetEnemyId: targetId,
              timedOut,
              nextQuestionCodigo: nextQ?.codigo,
            }),
          });
          if (res.ok) {
            const serverData = await res.json();
            if (serverData.snapshot) onSnapshotUpdate(serverData.snapshot);
            if (!nextQ && serverData.nextQuestion) {
              setTurnResult((prev) => (prev ? { ...prev, nextQuestion: serverData.nextQuestion } : prev));
            }
          }
        })
        .catch(() => {
          /* silencioso no background; próximo snapshot reconcilia */
        });
      return;
    }

    // Fallback de rede caso a questão não tenha vindo com gabarito local
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/rpg/challenge/answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nodeId: node.id,
          selectedAnswers: chosenAnswers,
          targetEnemyId: targetId,
          timedOut,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao enviar resposta.');

      setEncounter(data.encounter);
      setTurnResult(data);
      onSnapshotUpdate(data.snapshot);
      playTurnFx(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao corrigir questão.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = () => void submitAnswer(false);

  const handleNextTurn = () => {
    if (!turnResult?.nextQuestion) return;
    playRpgSfx('click');
    setQuestion(turnResult.nextQuestion);
    setTurnResult(null);
    setSelected([]);
    setEliminated([]);
    setHintText(null);
    setHintSources([]);
    setError(null);
    const nextAlive = encounter.enemies.find((e) => e.currentHp > 0);
    if (nextAlive) setTargetEnemyId(nextAlive.id);
  };

  return (
    <div className="fixed inset-0 z-50 w-screen h-[100dvh] bg-[#0c0a10] flex flex-col overflow-hidden">
      {/* Arena 100% Full Screen sem espaços sobrando */}
      <div
        className={cn(
          'w-full h-full flex flex-col overflow-hidden',
          screenShake && 'animate-rpg-screen-shake'
        )}
      >
        {/* HUD Superior Responsiva */}
        <div className="px-3 sm:px-5 py-2 sm:py-3 bg-gradient-to-b from-[#261f26] to-[#161218] border-b-2 border-[#8f6b47] flex items-center justify-between gap-2 sm:gap-3 shrink-0">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
              {equippedHeroes.map((h) => (
                <div
                  key={h.id}
                  className="w-8 h-8 sm:w-11 sm:h-11 rounded-lg sm:rounded-xl bg-[#261e24] border-2 border-[#c9974b] flex items-center justify-center overflow-hidden"
                >
                  <HeroSprite heroClassId={h.heroClassId} size={32} className="sm:scale-125" />
                </div>
              ))}
            </div>
            <div className="flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1 rounded-xl bg-[#110e15] border-2 border-[#6e523a]">
              <Heart className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-rose-500 fill-rose-500 shrink-0" />
              <div className="w-20 sm:w-32 h-3.5 sm:h-4 rounded-full bg-black/80 overflow-hidden relative">
                <div className="h-full bg-rose-500" style={{ width: `${partyHpPct}%` }} />
                <span className="absolute inset-0 flex items-center justify-center text-[10px] sm:text-[11px] font-extrabold text-white">
                  {partyHp}/{partyMaxHp}
                </span>
              </div>
            </div>
            <span className="hidden md:inline text-sm font-extrabold uppercase tracking-wider text-[#f7dc94] truncate">
              {region.name} • Nível {node.globalLevel}
            </span>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-3 text-xs sm:text-sm font-extrabold shrink-0">
            <span className="inline-flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1 rounded-xl bg-[#110e15] border border-[#c9974b]/70 text-[#fde68a]">
              <Lightbulb className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#f5c451]" /> {hintsRemaining}
            </span>
            <span className="inline-flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1 rounded-xl bg-[#110e15] border border-yellow-500/50 text-yellow-300">
              <Coins className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> {gold}
            </span>
            <button
              type="button"
              onClick={() => {
                playRpgSfx('click');
                onClose();
              }}
              className="p-1.5 sm:p-2 rounded-xl bg-[#2a181c] border-2 border-rose-500/60 text-rose-200 hover:bg-rose-900"
              title="Recuar para o Mapa"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Palco Cinematográfico Responsivo (compacto no mobile, amplo no desktop) */}
        <div className="relative flex-1 min-h-[180px] sm:min-h-[260px] w-full overflow-hidden border-b-2 border-[#8f6b47]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/rpg/backgrounds/${region.id}.jpg`}
            alt=""
            className="absolute inset-0 w-full h-full object-cover rpg-pixel pointer-events-none"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#0d0a10] via-transparent to-[#0d0a10]/40 pointer-events-none" />

          <div className="relative z-10 w-full h-full max-w-[1280px] mx-auto flex items-end justify-between px-3 sm:px-20 pb-3 sm:pb-8">

          {/* Popup flutuante de dano */}
          {dmgPopup && (
            <div
              key={dmgPopup.key}
              className="pointer-events-none absolute left-1/2 top-1/3 z-40 animate-rpg-dmg"
            >
              <div
                className={cn(
                  'px-3.5 sm:px-5 py-1 sm:py-1.5 rounded-xl border-2 text-sm sm:text-2xl font-black shadow-2xl whitespace-nowrap',
                  dmgPopup.tone === 'crit' && 'bg-amber-400 text-slate-950 border-yellow-100',
                  dmgPopup.tone === 'hit' && 'bg-emerald-600 text-white border-emerald-200',
                  dmgPopup.tone === 'parry' && 'bg-sky-400 text-slate-950 border-sky-100',
                  dmgPopup.tone === 'bad' && 'bg-rose-700 text-white border-rose-200'
                )}
              >
                {dmgPopup.text}
              </div>
            </div>
          )}

          {/* Heróis à Esquerda */}
          <div className="relative z-10 flex items-end gap-1.5 sm:gap-7">
            {vfx?.target === 'hero' && <VfxBurst type={vfx.type} triggerKey={vfx.key} size={110} />}
            {localHeroes.map((hero) => {
              const hpPct = Math.max(0, Math.round((hero.currentHp / hero.maxHp) * 100));
              return (
                <div key={hero.id} className="flex flex-col items-center">
                  <div className="mb-1 text-center">
                    <div className="text-[10px] sm:text-[11px] font-extrabold uppercase tracking-wider text-amber-100 drop-shadow-[0_2px_3px_rgba(0,0,0,0.95)]">
                      {hero.name.split(',')[0]}{' '}
                      <span className="text-[#f5c451]">Nv.{hero.level}</span>
                    </div>
                    <div className="w-16 sm:w-24 h-2.5 sm:h-3 rounded bg-[#140e12] border border-[#c9974b] overflow-hidden relative mt-0.5 shadow-md">
                      <div
                        className="h-full bg-gradient-to-r from-red-700 to-rose-500 transition-all duration-300"
                        style={{ width: `${hpPct}%` }}
                      />
                      <span className="absolute inset-0 flex items-center justify-center text-[8px] sm:text-[9px] font-extrabold text-white drop-shadow">
                        {hero.currentHp}/{hero.maxHp}
                      </span>
                    </div>
                  </div>
                  <div className="w-[74px] h-[74px] sm:w-[122px] sm:h-[122px] flex items-center justify-center">
                    <HeroSprite heroClassId={hero.heroClassId} anim={heroAnim} size={122} className="!w-full !h-full" />
                  </div>
                  {!turnResult && (
                    <span className="mt-0.5 text-[9px] sm:text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#fde68a] drop-shadow-[0_2px_4px_rgba(0,0,0,1)]">
                      {isEnemyTurn ? 'DEFESA' : 'HERO TURN'}
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          {/* Monstros Inimigos à Direita */}
          <div className="relative z-10 flex items-end gap-2 sm:gap-9">
            {vfx?.target === 'enemy' && <VfxBurst type={vfx.type} triggerKey={vfx.key} size={125} />}
            {encounter.enemies.map((enemy, idx) => {
              const isDead = enemy.currentHp <= 0;
              const isTarget = !isDead && enemy.id === activeTargetId;
              const hpPct = Math.max(0, Math.round((enemy.currentHp / enemy.maxHp) * 100));

              return (
                <button
                  key={enemy.id}
                  type="button"
                  disabled={isDead}
                  onClick={() => {
                    if (!isDead) {
                      playRpgSfx('click');
                      setTargetEnemyId(enemy.id);
                    }
                  }}
                  className={cn(
                    'flex flex-col items-center transition-all duration-500 focus:outline-none',
                    isDead && 'opacity-15 grayscale scale-75 translate-y-4 cursor-default',
                    !isDead && 'cursor-pointer hover:scale-105',
                    hitEnemyId === enemy.id && 'animate-rpg-hit'
                  )}
                >
                  <div className="mb-1 text-center">
                    {isEnemyTurn && !turnResult && enemy.id === encounter.attackingEnemyId ? (
                      <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full bg-rose-600 text-white text-[8.5px] sm:text-[9.5px] font-black uppercase tracking-wider mb-0.5 animate-pulse">
                        Atacando!
                      </span>
                    ) : isTarget ? (
                      <span className="inline-flex items-center gap-0.5 px-1.5 sm:px-2 py-0.5 rounded-full bg-[#f5c451] text-slate-950 text-[8.5px] sm:text-[9px] font-black uppercase tracking-wider mb-0.5">
                        <Crosshair className="w-2.5 h-2.5" /> Alvo
                      </span>
                    ) : null}
                    <div className="text-[9.5px] sm:text-[11px] font-extrabold uppercase tracking-wider text-amber-100 drop-shadow-[0_2px_3px_rgba(0,0,0,0.95)] max-w-[82px] sm:max-w-none truncate">
                      {enemy.name}
                    </div>
                    <div className="w-18 sm:w-28 h-2.5 sm:h-3 rounded bg-[#140e12] border border-[#c9974b] overflow-hidden relative mt-0.5 shadow-md mx-auto">
                      <div
                        className="h-full bg-gradient-to-r from-rose-700 to-red-500 transition-all duration-300"
                        style={{ width: `${hpPct}%` }}
                      />
                      <span className="absolute inset-0 flex items-center justify-center text-[8px] sm:text-[9px] font-extrabold text-white drop-shadow">
                        {isDead ? 'KO' : `${enemy.currentHp}/${enemy.maxHp}`}
                      </span>
                    </div>
                  </div>

                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/rpg/monsters/${enemy.sprite}`}
                    alt={enemy.name}
                    className={cn(
                      'object-contain rpg-pixel drop-shadow-[0_12px_20px_rgba(0,0,0,0.85)]',
                      !isDead && 'animate-rpg-boss-hover',
                      isTarget && 'drop-shadow-[0_0_18px_rgba(245,196,81,0.75)]',
                      enemy.isElite ? 'w-22 h-22 sm:w-40 sm:h-40' : 'w-18 h-18 sm:w-32 sm:h-32'
                    )}
                    style={{ animationDelay: `${idx * 0.45}s` }}
                  />
                </button>
              );
            })}
          </div>
          </div>
        </div>

        {/* Painel Medieval Inferior de Desafio */}
        <div className="bg-[#16131c] px-3.5 sm:px-8 py-3.5 sm:py-5 shrink-0 max-h-[58dvh] sm:max-h-[50vh] overflow-y-auto">
          <div className="max-w-5xl mx-auto space-y-3.5">
          {/* Faixa de Título + Cronômetro de Defesa Ativa (quando ENEMY TURN) */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#5e4a38] pb-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <div
                className={cn(
                  'inline-flex items-center gap-2 px-3.5 py-1 rounded-lg border text-xs font-extrabold uppercase tracking-[0.16em]',
                  isEnemyTurn && !turnResult
                    ? 'bg-rose-950/90 border-rose-400 text-rose-100 animate-pulse'
                    : 'bg-[#2a211b] border-[#c9974b] text-[#f7dc94]'
                )}
              >
                {isEnemyTurn && !turnResult
                  ? `ENEMY TURN — Defenda o Ataque! (${question.codigo})`
                  : `HERO TURN • Turno ${encounter.turnNumber} (${question.codigo})`}
              </div>

              {isEnemyTurn && !turnResult && (
                <EnemyTurnTimer
                  timeLimitSec={timeLimitSec}
                  turnKey={encounter.turnNumber}
                  onTimeout={() => void submitAnswer(true)}
                />
              )}
            </div>

            {!turnResult && (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={loadingHint || hintsRemaining <= 0}
                  onClick={handleUseHint}
                  className="rpg-option-btn inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-extrabold text-[#fde68a] disabled:opacity-40"
                >
                  {loadingHint ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Lightbulb className="w-3.5 h-3.5 text-[#f5c451]" />}
                  Dica ({hintsRemaining})
                </button>

                {elimItems.map((entry) => {
                  const def = getItemDefinition(entry.itemId)!;
                  return (
                    <button
                      key={entry.id}
                      type="button"
                      disabled={loadingElim === entry.itemId}
                      onClick={() => handleEliminate(entry.itemId)}
                      className="rpg-option-btn inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-extrabold text-sky-200 disabled:opacity-40"
                    >
                      {loadingElim === entry.itemId ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <ItemIcon itemId={def.id} size={16} />
                      )}
                      {def.name} (×{entry.quantity})
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Enunciado */}
          <p className="text-sm sm:text-base font-semibold text-amber-50 text-center leading-relaxed max-w-4xl mx-auto whitespace-pre-line">
            {question.enunciado}
          </p>

          {question.tipo === 'multipla' && (
            <div className="text-center text-[11px] font-bold uppercase tracking-wider text-[#f5c451]">
              Questão de Múltipla Resposta ({question.quantidade_respostas})
            </div>
          )}

          {question.managedImageUrl && (
            <div className="rounded-xl bg-white p-2 max-w-xl mx-auto">
              <QuestionImageViewer
                codigo={question.codigo}
                managedImageUrl={question.managedImageUrl}
                originalImagePath={null}
                imageMissing={false}
              />
            </div>
          )}

          {hintText && (
            <div className="rounded-xl border border-[#c9974b]/70 bg-[#2a1f16] p-3 text-xs sm:text-sm text-amber-100 flex items-start gap-2 animate-card-enter">
              <Sparkles className="w-4 h-4 text-[#f5c451] shrink-0 mt-0.5" />
              <div>
                <div>{hintText}</div>
                {hintSources.length > 0 && (
                  <div className="text-[11px] text-[#c9b29b] mt-1">
                    Syllabus: {hintSources.map((s) => `${s.eu} (${s.title})`).join(' · ')}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Grade 2x2 de Alternativas Chanfradas */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {Object.entries(question.alternativas).map(([letter, text]) => {
              const upper = letter.toUpperCase();
              const isElim = eliminated.includes(upper);
              const isSel = selected.includes(upper);
              const isCorrectOpt = turnResult?.correctAnswers.includes(upper);

              return (
                <button
                  key={upper}
                  type="button"
                  disabled={Boolean(turnResult) || isElim}
                  onClick={() => toggleOption(upper)}
                  className={cn(
                    'w-full text-left px-3.5 py-2.5 rounded-xl flex items-start gap-2.5',
                    isElim && 'opacity-25 line-through bg-[#120f17] border-2 border-[#302838] cursor-not-allowed',
                    !isElim && !turnResult && (isSel ? 'rpg-option-btn-selected text-amber-50' : 'rpg-option-btn text-slate-200'),
                    turnResult && isCorrectOpt && 'bg-emerald-950/85 border-2 border-emerald-400 text-emerald-100',
                    turnResult && isSel && !isCorrectOpt && 'bg-rose-950/85 border-2 border-rose-400 text-rose-100',
                    turnResult && !isCorrectOpt && !isSel && 'bg-[#17141d] border-2 border-[#3a303f] text-slate-400'
                  )}
                >
                  <span className="font-extrabold text-sm text-[#f7dc94] shrink-0">{upper}.</span>
                  <span className="text-xs sm:text-sm leading-snug">{text}</span>
                </button>
              );
            })}
          </div>

          {error && (
            <div className="rounded-lg bg-rose-950/80 border border-rose-400/50 px-3 py-2 text-xs text-rose-200 text-center">
              {error}
            </div>
          )}

          {/* Feedback do Turno */}
          {turnResult && (
            <div
              className={cn(
                'rounded-xl border-2 p-3.5 space-y-1.5 animate-card-enter',
                turnResult.encounterStatus === 'defeat'
                  ? 'bg-rose-950/85 border-rose-400'
                  : turnResult.isCorrect
                    ? 'bg-emerald-950/65 border-emerald-400/70'
                    : 'bg-rose-950/65 border-rose-400/70'
              )}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="inline-flex items-center gap-2 text-xs sm:text-sm font-extrabold text-white">
                  {turnResult.encounterStatus === 'defeat' ? (
                    <Skull className="w-4 h-4 text-rose-300" />
                  ) : turnResult.isCorrect ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <XCircle className="w-4 h-4 text-rose-400" />
                  )}
                  {turnResult.encounterStatus === 'victory'
                    ? 'Vitória! Todos os inimigos foram derrotados!'
                    : turnResult.encounterStatus === 'defeat'
                      ? 'Grupo derrotado! Retornando ao último Checkpoint com 60% de HP.'
                      : turnResult.attackBlocked
                        ? `Ataque de ${turnResult.targetEnemyName} BLOQUEADO com perfeição!`
                        : turnResult.timedOut
                          ? `Tempo esgotado! ${turnResult.targetEnemyName} acertou o grupo!`
                          : turnResult.isCorrect
                            ? `Você acertou ${turnResult.targetEnemyName}!`
                            : turnResult.parriedByHeroName
                              ? `Parry executado por ${turnResult.parriedByHeroName}!`
                              : 'Os inimigos contra-atacaram!'}
                </span>
                <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-extrabold">
                  {turnResult.damageDealt > 0 && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-500/25 text-amber-200">
                      {turnResult.isCritical && <Flame className="w-3 h-3" />}
                      -{turnResult.damageDealt} HP {turnResult.isCritical ? 'CRÍTICO!' : ''}
                    </span>
                  )}
                  {turnResult.parriedByHeroName && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-sky-500/25 text-sky-200">
                      <Shield className="w-3 h-3" /> PARRY
                    </span>
                  )}
                  {turnResult.hpPenalty > 0 && (
                    <span className="px-2 py-0.5 rounded bg-rose-500/30 text-rose-200">
                      -{turnResult.hpPenalty} HP
                    </span>
                  )}
                  {turnResult.xpAwarded > 0 && (
                    <span className="px-2 py-0.5 rounded bg-indigo-500/30 text-indigo-200">
                      +{turnResult.xpAwarded} XP
                    </span>
                  )}
                </div>
              </div>
              <p className="text-xs text-slate-200 leading-relaxed">{turnResult.explanation}</p>
            </div>
          )}

          {/* Barra de Ação */}
          <div className="flex justify-center pt-1 pb-2 sm:pb-0">
            {!turnResult ? (
              <button
                type="button"
                disabled={selected.length === 0 || submitting}
                onClick={handleSubmit}
                className={cn(
                  'w-full sm:w-auto inline-flex items-center justify-center gap-2 px-8 py-3 sm:py-2.5 rounded-xl text-sm font-extrabold uppercase tracking-wider disabled:opacity-40',
                  isEnemyTurn ? 'rpg-btn-gold' : 'rpg-btn-emerald'
                )}
              >
                {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                {isEnemyTurn ? 'Bloquear Ataque!' : 'Enviar Resposta'}
              </button>
            ) : turnResult.encounterStatus === 'in_progress' ? (
              <button
                type="button"
                onClick={handleNextTurn}
                className="w-full sm:w-auto rpg-btn-gold inline-flex items-center justify-center gap-2 px-8 py-3 sm:py-2.5 rounded-xl text-sm font-extrabold uppercase tracking-wider"
              >
                Próximo Turno
                <ArrowRight className="w-4 h-4" />
              </button>
            ) : turnResult.encounterStatus === 'victory' && turnResult.rewardChestAvailable ? (
              <button
                type="button"
                disabled={waitingChestSync}
                onClick={async () => {
                  playRpgSfx('click');
                  setWaitingChestSync(true);
                  try {
                    await syncQueueRef.current;
                  } finally {
                    setWaitingChestSync(false);
                  }
                  onOpenRewardChest(node.id, turnResult.rewardChestStyle);
                }}
                className="w-full sm:w-auto rpg-btn-gold inline-flex items-center justify-center gap-2 px-8 py-3 sm:py-2.5 rounded-xl text-sm font-extrabold uppercase tracking-wider animate-pulse disabled:opacity-70"
              >
                {waitingChestSync ? <Loader2 className="w-4 h-4 animate-spin" /> : <Gift className="w-4 h-4" />}
                Escolher Baú de Prêmio!
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  playRpgSfx('click');
                  onClose();
                }}
                className="w-full sm:w-auto rpg-btn-gold px-8 py-3 sm:py-2.5 rounded-xl text-sm font-extrabold uppercase tracking-wider"
              >
                {turnResult.encounterStatus === 'defeat' ? 'Retornar ao Checkpoint' : 'Voltar ao Mapa'}
              </button>
            )}
          </div>
          </div>
        </div>
      </div>
    </div>
  );
}

'use client';

import { useState } from 'react';
import {
  Crown,
  Flame,
  Heart,
  Lightbulb,
  Loader2,
  Send,
  Shield,
  Skull,
  Sparkles,
  Swords,
  Trophy,
} from 'lucide-react';
import {
  BossSprite,
  HeroSprite,
  VfxBurst,
  type RpgVfxType,
  type SpriteAnimState,
} from '@/components/rpg/RpgArtwork';
import { playRpgSfx } from '@/lib/rpg/audio';
import { getBossById } from '@/lib/rpg/data/bosses';
import { cn } from '@/lib/utils';
import type {
  RpgBossBattleState,
  RpgBossTurnRecord,
  RpgCampaignSnapshot,
  RpgHeroState,
} from '@/types/rpg';

export function BossBattleArena({
  battle,
  equippedHeroes,
  hintsRemaining,
  onSnapshotUpdate,
  onExitArena,
}: {
  battle: RpgBossBattleState;
  equippedHeroes: RpgHeroState[];
  hintsRemaining: number;
  onSnapshotUpdate: (snapshot: RpgCampaignSnapshot) => void;
  onExitArena: () => void;
}) {
  const boss = getBossById(battle.bossId);
  const [answer, setAnswer] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [loadingHint, setLoadingHint] = useState(false);
  const [hintText, setHintText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [heroAnim, setHeroAnim] = useState<SpriteAnimState>('idle');
  const [bossAnim, setBossAnim] = useState<SpriteAnimState>('idle');
  const [arenaShake, setArenaShake] = useState(false);
  const [bossVfx, setBossVfx] = useState<{ type: RpgVfxType; key: number }>({ type: 'slash', key: 0 });
  const [heroVfx, setHeroVfx] = useState<{ type: RpgVfxType; key: number }>({ type: 'parry', key: 0 });
  const [floatingBanner, setFloatingBanner] = useState<{
    key: number;
    text: string;
    tone: 'crit' | 'hit' | 'parry' | 'boss_hit';
  } | null>(null);

  const [lastTurn, setLastTurn] = useState<RpgBossTurnRecord | null>(
    battle.turns[battle.turns.length - 1] ?? null
  );
  const [outcome, setOutcome] = useState<{
    status: 'victory' | 'defeat';
    unlockedHeroName: string | null;
    unlockedNextRegionName: string | null;
    xpAwarded: number;
  } | null>(null);

  const bossHpPct = Math.max(0, Math.round((battle.bossCurrentHp / battle.bossMaxHp) * 100));

  const bossAttackVfxType: RpgVfxType =
    boss.regionId === 'caverna-de-fogo'
      ? 'fire'
      : boss.regionId === 'dungeon-de-gelo'
        ? 'ice'
        : 'dark';

  const handleUseHint = async () => {
    setLoadingHint(true);
    setError(null);
    try {
      const res = await fetch('/api/rpg/challenge/hint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bossQuestionText: battle.currentPrompt.question,
          topicId: battle.currentPrompt.topicId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao obter dica.');
      playRpgSfx('hint_sparkle');
      setHintText(data.hint);
      onSnapshotUpdate(data.snapshot);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao solicitar dica.');
    } finally {
      setLoadingHint(false);
    }
  };

  const handleSubmitTurn = async () => {
    if (answer.trim().length < 8) {
      setError('Desenvolva um pouco mais sua resposta discursiva (mínimo 8 caracteres).');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/rpg/boss/turn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ battleId: battle.id, playerAnswer: answer }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao avaliar resposta.');

      const turn = data.turn as RpgBossTurnRecord;
      setLastTurn(turn);
      setAnswer('');
      setHintText(null);

      const nowKey = Date.now();

      if (turn.damageDealt > 0) {
        setHeroAnim('attack');
        setBossAnim('hit');
        setBossVfx({ type: turn.isCritical ? 'crit' : 'slash', key: nowKey });
        setFloatingBanner({
          key: nowKey,
          text: turn.isCritical ? `-${turn.damageDealt} CRÍTICO!` : `-${turn.damageDealt} HP`,
          tone: turn.isCritical ? 'crit' : 'hit',
        });
        if (turn.isCritical) {
          setArenaShake(true);
          playRpgSfx('crit_boom');
        } else {
          playRpgSfx('sword_hit');
        }
      } else if (turn.parriedByHeroId) {
        setHeroAnim('parry');
        setBossAnim('attack');
        setHeroVfx({ type: 'parry', key: nowKey });
        setFloatingBanner({
          key: nowKey,
          text: `PARRY! (${turn.parriedByHeroName})`,
          tone: 'parry',
        });
        playRpgSfx('parry_clang');
      } else {
        setHeroAnim('hit');
        setBossAnim('attack');
        setHeroVfx({ type: bossAttackVfxType, key: nowKey });
        setArenaShake(true);
        setFloatingBanner({
          key: nowKey,
          text: `-${turn.bossDamageDealt} HP NO GRUPO`,
          tone: 'boss_hit',
        });
        playRpgSfx('boss_hit');
      }

      window.setTimeout(() => {
        setArenaShake(false);
        setHeroAnim(
          data.battleStatus === 'victory'
            ? 'victory'
            : data.battleStatus === 'defeat'
              ? 'defeat'
              : 'idle'
        );
        setBossAnim(data.battleStatus === 'victory' ? 'defeat' : 'idle');
      }, 720);

      if (data.battleStatus === 'victory' || data.battleStatus === 'defeat') {
        playRpgSfx(data.battleStatus === 'victory' ? 'victory_fanfare' : 'defeat_chord');
        setOutcome({
          status: data.battleStatus,
          unlockedHeroName: data.unlockedHeroName,
          unlockedNextRegionName: data.unlockedNextRegionName,
          xpAwarded: data.xpAwarded,
        });
      }

      onSnapshotUpdate(data.snapshot);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao enviar resposta.');
    } finally {
      setSubmitting(false);
    }
  };

  if (outcome) {
    const isWin = outcome.status === 'victory';
    return (
      <div className="rpg-panel-gold rounded-3xl p-6 sm:p-10 text-center space-y-6 animate-card-enter">
        <div className="inline-flex items-center justify-center w-22 h-22 rounded-full bg-[#2a1d14] border-2 border-[#f5c451] mx-auto shadow-[0_0_30px_rgba(245,196,81,0.4)]">
          {isWin ? (
            <Trophy className="w-11 h-11 text-[#f5c451]" />
          ) : (
            <Skull className="w-11 h-11 text-rose-400" />
          )}
        </div>

        <div className="space-y-2 max-w-xl mx-auto">
          <div
            className={cn(
              'text-xs font-extrabold uppercase tracking-[0.2em]',
              isWin ? 'text-[#f7dc94]' : 'text-rose-300'
            )}
          >
            {isWin ? 'Vitória Épica • Região Concluída' : 'Grupo Derrotado • Recuperação Segura'}
          </div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-amber-50">
            {isWin ? `${boss.name} foi derrotado!` : `${boss.name} prevaleceu neste confronto`}
          </h2>
          <p className="text-sm text-[#e0d2c3] leading-relaxed">
            {isWin
              ? boss.defeatLine
              : 'Seu progresso na campanha foi preservado! Seus heróis recuperaram 60% da vida e retornaram ao último Checkpoint para se reorganizar e tentar novamente.'}
          </p>
        </div>

        {isWin && (
          <div className="flex flex-wrap justify-center gap-3">
            {outcome.xpAwarded > 0 && (
              <span className="px-4 py-2 rounded-xl bg-amber-500/20 border border-amber-400/50 text-amber-200 text-sm font-extrabold">
                +{outcome.xpAwarded} XP
              </span>
            )}
            <span className="px-4 py-2 rounded-xl bg-yellow-500/20 border border-yellow-400/50 text-yellow-200 text-sm font-extrabold">
              +{boss.goldReward} Ouro
            </span>
            {outcome.unlockedHeroName && (
              <span className="px-4 py-2 rounded-xl bg-indigo-500/25 border border-indigo-400/55 text-indigo-200 text-sm font-extrabold">
                Novo Herói: {outcome.unlockedHeroName}
              </span>
            )}
            {outcome.unlockedNextRegionName && (
              <span className="px-4 py-2 rounded-xl bg-emerald-500/20 border border-emerald-400/50 text-emerald-200 text-sm font-extrabold">
                Região Liberada: {outcome.unlockedNextRegionName}
              </span>
            )}
          </div>
        )}

        <button
          type="button"
          onClick={() => {
            playRpgSfx('click');
            onExitArena();
          }}
          className="rpg-btn-gold px-7 py-3 rounded-xl font-extrabold text-sm"
        >
          {isWin ? 'Continuar a Jornada' : 'Retornar ao Mapa'}
        </button>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'rpg-panel-gold rounded-3xl overflow-hidden relative',
        arenaShake && 'animate-rpg-screen-shake'
      )}
    >
      {/* Topo da Arena */}
      <div className="px-5 py-3.5 bg-gradient-to-r from-[#451313]/90 via-[#2a1714]/90 to-[#1a1210]/90 border-b border-[#745338] flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <Crown className="w-5 h-5 text-[#f5c451]" />
          <div>
            <div className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-rose-300">
              Combate Tático por Turnos • Turno {battle.turnNumber}
            </div>
            <h2 className="text-lg font-extrabold text-amber-50">
              {boss.name} <span className="font-normal text-[#d4c0ac] text-sm">— {boss.title}</span>
            </h2>
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            playRpgSfx('click');
            onExitArena();
          }}
          className="px-3.5 py-1.5 rounded-xl border border-[#745338] bg-[#1b1412] text-xs font-bold text-[#e5d5c5] hover:border-[#f5c451]"
        >
          Recuar para o Mapa
        </button>
      </div>

      {/* Palco de Combate com Cenário Real da Região + Sprites Pixel Art + VFX */}
      <div className="relative p-5 sm:p-7 grid grid-cols-1 lg:grid-cols-12 gap-6 items-center border-b border-[#745338] overflow-hidden">
        {/* Fundo do palco com a arte da região */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`/rpg/backgrounds/${boss.regionId}.jpg`}
          alt=""
          className="absolute inset-0 w-full h-full object-cover rpg-pixel opacity-45 pointer-events-none"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#140d0c]/90 via-[#140d0c]/45 to-[#140d0c]/65 pointer-events-none" />

        {/* Banner flutuante de dano/crítico/parry */}
        {floatingBanner && (
          <div
            key={floatingBanner.key}
            className="pointer-events-none absolute left-1/2 top-1/3 z-40 animate-rpg-dmg"
          >
            <div
              className={cn(
                'px-5 py-2 rounded-2xl border-2 text-lg sm:text-xl font-black tracking-wide shadow-2xl',
                floatingBanner.tone === 'crit' && 'bg-amber-500 text-slate-950 border-yellow-200',
                floatingBanner.tone === 'hit' && 'bg-emerald-600 text-white border-emerald-300',
                floatingBanner.tone === 'parry' && 'bg-sky-500 text-slate-950 border-sky-200',
                floatingBanner.tone === 'boss_hit' && 'bg-rose-700 text-white border-rose-300'
              )}
            >
              {floatingBanner.text}
            </div>
          </div>
        )}

        {/* Heróis à Esquerda */}
        <div className="lg:col-span-5 relative z-10 space-y-3">
          <div className="relative">
            <VfxBurst type={heroVfx.type} triggerKey={heroVfx.key} size={120} />
            <div className="space-y-2.5">
              {equippedHeroes.map((hero) => {
                const hpPct = Math.max(0, Math.round((hero.currentHp / hero.maxHp) * 100));
                return (
                  <div
                    key={hero.id}
                    className="rpg-panel rounded-2xl p-3 flex items-center gap-3"
                  >
                    <HeroSprite heroClassId={hero.heroClassId} anim={heroAnim} size={74} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-extrabold text-amber-50 truncate">{hero.name}</span>
                        <span className="text-[11px] font-extrabold text-[#f5c451]">Nv.{hero.level}</span>
                      </div>
                      <div className="mt-1.5 h-3 rounded-full bg-[#120c0b] border border-[#745338] overflow-hidden p-[1px]">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-red-600 to-rose-400 transition-all duration-300"
                          style={{ width: `${hpPct}%` }}
                        />
                      </div>
                      <div className="mt-1 flex items-center justify-between text-[11px] text-[#d4c0ac]">
                        <span className="inline-flex items-center gap-1 text-rose-300 font-bold">
                          <Heart className="w-3 h-3" /> {hero.currentHp}/{hero.maxHp}
                        </span>
                        <span className="font-semibold">
                          Dano {hero.baseDamage} · Parry {Math.round(hero.parryChance * 100)}%
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Centro VS */}
        <div className="lg:col-span-2 relative z-10 flex flex-col items-center justify-center gap-1">
          <div className="w-14 h-14 rounded-full bg-[#241814]/90 border-2 border-[#c9974b] flex items-center justify-center shadow-xl">
            <Swords className="w-7 h-7 text-[#f5c451]" />
          </div>
          <span className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-[#f7dc94]">
            Turno {battle.turnNumber}
          </span>
        </div>

        {/* Chefe à Direita */}
        <div className="lg:col-span-5 relative z-10 flex flex-col items-center text-center space-y-3">
          <div className="relative">
            <VfxBurst type={bossVfx.type} triggerKey={bossVfx.key} size={145} />
            <BossSprite bossId={boss.id} anim={bossAnim} size={172} />
          </div>
          <div className="w-full max-w-xs rpg-panel rounded-2xl p-3 space-y-1.5">
            <div className="flex items-center justify-between text-xs font-extrabold">
              <span className="text-rose-300">{boss.name}</span>
              <span className="text-amber-50">
                {battle.bossCurrentHp} / {battle.bossMaxHp} HP
              </span>
            </div>
            <div className="h-3.5 rounded-full bg-[#120c0b] border border-[#c9974b]/70 overflow-hidden p-[1px]">
              <div
                className="h-full rounded-full bg-gradient-to-r from-rose-700 via-red-500 to-amber-400 transition-all duration-500"
                style={{ width: `${bossHpPct}%` }}
              />
            </div>
            <p className="text-[11px] italic text-[#d4c0ac]">&ldquo;{boss.introLine}&rdquo;</p>
          </div>
        </div>
      </div>

      {/* Área de Pergunta Discursiva e Avaliação IA */}
      <div className="p-5 sm:p-6 space-y-4 bg-[#181210]/95">
        {lastTurn && (
          <div className="rpg-panel rounded-2xl p-4 space-y-2 animate-card-enter">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-extrabold uppercase tracking-wider text-[#f7dc94]">
                Turno {lastTurn.turnNumber} • {lastTurn.evaluation.providerLabel}
              </span>
              <div className="flex flex-wrap items-center gap-2 text-xs font-extrabold">
                <span className="px-2.5 py-0.5 rounded-lg bg-white/10 text-white">
                  Domínio: {Math.round(lastTurn.evaluation.score * 100)}%
                </span>
                {lastTurn.damageDealt > 0 && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-amber-500/25 text-amber-200">
                    {lastTurn.isCritical && <Flame className="w-3.5 h-3.5 text-amber-300" />}
                    -{lastTurn.damageDealt} HP {lastTurn.isCritical ? '(CRÍTICO!)' : ''}
                  </span>
                )}
                {lastTurn.parriedByHeroName && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-sky-500/25 text-sky-200">
                    <Shield className="w-3.5 h-3.5" /> PARRY ({lastTurn.parriedByHeroName})
                  </span>
                )}
                {lastTurn.bossDamageDealt > 0 && (
                  <span className="px-2.5 py-0.5 rounded-lg bg-rose-500/25 text-rose-200">
                    Contra-ataque: -{lastTurn.bossDamageDealt} HP
                  </span>
                )}
              </div>
            </div>
            <p className="text-xs sm:text-sm text-[#ece0d3] leading-relaxed">
              {lastTurn.evaluation.feedback}
            </p>
            {lastTurn.evaluation.missingConcepts.length > 0 && (
              <div className="text-[11px] text-[#f5c451]">
                <strong>Conceitos a reforçar:</strong> {lastTurn.evaluation.missingConcepts.join(' · ')}
              </div>
            )}
          </div>
        )}

        <div className="rounded-2xl border-2 border-[#c9974b]/50 bg-[#241a15] p-4 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-extrabold uppercase tracking-wider text-[#f7dc94]">
              Desafio Discursivo do Chefe (IREB CPRE-FL)
            </span>
            <button
              type="button"
              disabled={loadingHint || hintsRemaining <= 0}
              onClick={handleUseHint}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#c9974b]/20 border border-[#c9974b]/60 text-[#fde68a] hover:bg-[#c9974b]/35 disabled:opacity-40 text-xs font-bold"
            >
              {loadingHint ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Lightbulb className="w-3.5 h-3.5" />}
              Usar Dica ({hintsRemaining})
            </button>
          </div>
          <p className="text-sm sm:text-base font-semibold text-amber-50 leading-relaxed">
            {battle.currentPrompt.question}
          </p>
        </div>

        {hintText && (
          <div className="rounded-xl border border-indigo-400/45 bg-indigo-950/50 p-3.5 text-xs sm:text-sm text-indigo-100 flex items-start gap-2 animate-card-enter">
            <Sparkles className="w-4 h-4 text-indigo-300 shrink-0 mt-0.5" />
            <span>{hintText}</span>
          </div>
        )}

        <div className="space-y-2">
          <textarea
            rows={4}
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            placeholder="Explique o conceito com suas palavras com base no Syllabus IREB CPRE-FL..."
            className="w-full rounded-2xl border-2 border-[#745338] bg-[#120d0c] px-4 py-3 text-sm text-amber-50 placeholder:text-[#8c7a6b] focus:outline-none focus:border-[#f5c451]"
          />
          {error && <div className="text-xs text-rose-300">{error}</div>}
          <div className="flex justify-end">
            <button
              type="button"
              disabled={submitting || answer.trim().length < 8}
              onClick={handleSubmitTurn}
              className="w-full sm:w-auto rpg-btn-gold inline-flex items-center justify-center gap-2 px-6 py-3 sm:py-2.5 rounded-xl text-sm font-extrabold disabled:opacity-40"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              {submitting ? 'Avaliando com IA + Syllabus...' : 'Atacar com Resposta'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

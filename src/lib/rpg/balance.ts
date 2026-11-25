import type { RpgRarity, RpgStatKey } from '@/types/rpg';

/**
 * Configuração centralizada de balanceamento do módulo RPG "Jornada do Herói".
 * Todos os valores de progressão, combate, economia, dicas, checkpoints e drops
 * residem aqui para facilitar ajustes sem espalhar números mágicos pelo código.
 */
export const RPG_BALANCE = {
  campaign: {
    levelsPerRegion: 10,
    maxEquippedHeroes: 3,
    checkpointLevels: [5, 8] as readonly number[], // checkpoints após sequências reais de combate
    startingGold: 0,
  },

  xp: {
    baseXpForLevel2: 140,
    levelExponent: 1.55, // progressão conservadora e desafiadora
    regionMultiplierStep: 0.35, // +35% XP por região avançada
    rewards: {
      questionCorrect: 38,
      questionPartial: 16,
      questionWrong: 6,
      specialCorrect: 62,
      eventBase: 24,
      chestBase: 18,
      bossVictoryBase: 180,
      regionCompletionBonus: 120,
    },
  },

  levelUp: {
    statPointPerLevel: 1,
    increments: {
      maxHp: 8,
      intelligence: 1,
      baseDamage: 2,
      parryChance: 0.03, // +3%
      critChance: 0.03, // +3%
    } satisfies Record<RpgStatKey, number>,
    caps: {
      parryChance: 0.55,
      critChance: 0.55,
    },
  },

  combat: {
    questionWrongHpPenaltyBase: 14,
    questionWrongHpPenaltyPerRegion: 4,
    specialWrongHpPenaltyMultiplier: 1.35,
    partialScoreMin: 0.4,
    correctScoreMin: 0.8,
    minCritScoreThreshold: 0.72, // crítico só ativa quando há domínio conceitual real
    defeatRecoveryHpRatio: 0.6, // ao perder para chefe, recupera 60% do HP e retorna ao último checkpoint sem apagar progresso
    checkpointHintRestoreRatio: 0.5, // checkpoint recupera 50% das dicas gastas (mín. +2)
    checkpointHintRestoreMin: 2,
  },

  hints: {
    costPerHint: 1,
    minPoolFloor: 3,
  },

  rarityWeights: {
    common: 50,
    uncommon: 28,
    rare: 14,
    epic: 6,
    legendary: 2,
  } satisfies Record<RpgRarity, number>,

  rarityMeta: {
    common: { label: 'Comum', color: 'text-slate-300', border: 'border-slate-500/60', bg: 'bg-slate-800/70' },
    uncommon: { label: 'Incomum', color: 'text-emerald-300', border: 'border-emerald-500/60', bg: 'bg-emerald-950/60' },
    rare: { label: 'Raro', color: 'text-sky-300', border: 'border-sky-500/60', bg: 'bg-sky-950/60' },
    epic: { label: 'Épico', color: 'text-violet-300', border: 'border-violet-500/60', bg: 'bg-violet-950/60' },
    legendary: { label: 'Lendário', color: 'text-amber-300', border: 'border-amber-400/70', bg: 'bg-amber-950/60' },
  } satisfies Record<RpgRarity, { label: string; color: string; border: string; bg: string }>,
} as const;

/**
 * Calcula o XP necessário para subir do nível `level` para `level + 1`.
 */
export function computeXpForNextLevel(level: number): number {
  const safeLevel = Math.max(1, Math.floor(level));
  return Math.round(
    RPG_BALANCE.xp.baseXpForLevel2 * Math.pow(safeLevel, RPG_BALANCE.xp.levelExponent)
  );
}

/**
 * Aplica o multiplicador de dificuldade da região sobre uma recompensa base de XP.
 */
export function scaleXpByRegion(baseXp: number, regionIndex: number): number {
  const mult = 1 + Math.max(0, regionIndex) * RPG_BALANCE.xp.regionMultiplierStep;
  return Math.round(baseXp * mult);
}

import { normalizeAnswerSet } from '@/lib/evaluation';
import { computeXpForNextLevel, RPG_BALANCE } from '@/lib/rpg/balance';
import { getItemDefinition } from '@/lib/rpg/data/items';
import type {
  RpgActiveTempEffect,
  RpgHeroState,
  RpgStatKey,
} from '@/types/rpg';

export interface EffectivePartyStats {
  totalMaxHp: number;
  totalCurrentHp: number;
  totalBaseDamage: number;
  totalDefense: number;
  combinedParryChance: number;
  combinedCritChance: number;
  bestCritMultiplier: number;
  hintsMax: number;
}

/**
 * Calcula o pool total de dicas compartilhadas com base na inteligência
 * dos heróis equipados (respeitando o mínimo configurado).
 */
export function computePartyHintsMax(equippedHeroes: RpgHeroState[]): number {
  const sum = equippedHeroes.reduce((acc, h) => acc + Math.max(0, h.intelligence), 0);
  return Math.max(RPG_BALANCE.hints.minPoolFloor, sum);
}

/**
 * Consome 1 dica do pool compartilhado de forma segura.
 */
export function consumePartyHint(hintsRemaining: number): {
  allowed: boolean;
  nextHintsRemaining: number;
} {
  if (hintsRemaining < RPG_BALANCE.hints.costPerHint) {
    return { allowed: false, nextHintsRemaining: hintsRemaining };
  }
  return {
    allowed: true,
    nextHintsRemaining: hintsRemaining - RPG_BALANCE.hints.costPerHint,
  };
}

/**
 * Calcula os atributos efetivos agregados do grupo equipado, somando
 * equipamentos dos heróis e efeitos temporários ativos.
 */
export function computeEffectivePartyStats(
  equippedHeroes: RpgHeroState[],
  activeEffects: RpgActiveTempEffect[] = []
): EffectivePartyStats {
  let totalMaxHp = 0;
  let totalCurrentHp = 0;
  let totalBaseDamage = 0;
  let totalDefense = 0;
  let bestParry = 0;
  let bestCrit = 0;
  let bestCritMult = 1.5;

  for (const hero of equippedHeroes) {
    let heroMaxHp = hero.maxHp;
    let heroDamage = hero.baseDamage;
    let heroParry = hero.parryChance;
    let heroCrit = hero.critChance;
    let heroCritMult = hero.critMultiplier;

    for (const itemId of hero.equippedItemIds) {
      const def = getItemDefinition(itemId);
      if (!def) continue;
      heroMaxHp += def.effects.bonusMaxHp ?? 0;
      heroDamage += def.effects.bonusDamage ?? 0;
      totalDefense += def.effects.bonusDefense ?? 0;
      heroParry += def.effects.bonusParryChance ?? 0;
      heroCrit += def.effects.bonusCritChance ?? 0;
      heroCritMult += def.effects.bonusCritMultiplier ?? 0;
    }

    totalMaxHp += heroMaxHp;
    totalCurrentHp += Math.min(hero.currentHp, heroMaxHp);
    totalBaseDamage += heroDamage;
    bestParry = Math.max(bestParry, heroParry);
    bestCrit = Math.max(bestCrit, heroCrit);
    bestCritMult = Math.max(bestCritMult, heroCritMult);
  }

  for (const eff of activeEffects) {
    if (eff.remainingTurns <= 0) continue;
    totalBaseDamage += eff.bonusDamage ?? 0;
    totalDefense += eff.bonusDefense ?? 0;
    bestParry += eff.bonusParryChance ?? 0;
    bestCrit += eff.bonusCritChance ?? 0;
  }

  return {
    totalMaxHp,
    totalCurrentHp,
    totalBaseDamage: Math.max(10, totalBaseDamage),
    totalDefense: Math.max(0, totalDefense),
    combinedParryChance: Math.min(RPG_BALANCE.levelUp.caps.parryChance, Math.max(0, bestParry)),
    combinedCritChance: Math.min(RPG_BALANCE.levelUp.caps.critChance, Math.max(0, bestCrit)),
    bestCritMultiplier: bestCritMult,
    hintsMax: computePartyHintsMax(equippedHeroes),
  };
}

/**
 * Elimina `count` (1 ou 2) alternativas incorretas de uma questão de múltipla escolha.
 * GARANTIA ESTRITA: nunca remove nenhuma alternativa presente no gabarito oficial.
 */
export function eliminateWrongOptions(params: {
  alternativas: Record<string, string>;
  respostaCorreta: string | string[];
  alreadyEliminated?: string[];
  count: 1 | 2;
  rng?: () => number;
}): {
  newlyEliminated: string[];
  allEliminated: string[];
} {
  const correctSet = new Set(normalizeAnswerSet(params.respostaCorreta));
  const alreadySet = new Set((params.alreadyEliminated ?? []).map((x) => x.toUpperCase()));
  const rand = params.rng ?? Math.random;

  const removableWrong = Object.keys(params.alternativas)
    .map((k) => k.trim().toUpperCase())
    .filter((letter) => !correctSet.has(letter) && !alreadySet.has(letter));

  // Embaralha apenas entre incorretas elegíveis
  const pool = [...removableWrong];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }

  const newlyEliminated = pool.slice(0, params.count);
  const allEliminated = Array.from(new Set([...alreadySet, ...newlyEliminated])).sort();

  return { newlyEliminated, allEliminated };
}

/**
 * Calcula o dano causado ao chefe com base na qualidade conceitual da resposta (score 0..1),
 * atributos do grupo e chance de crítico (somente acima do limiar mínimo de domínio).
 */
export function calculateBossDamage(params: {
  score: number;
  classification: 'correct' | 'partial' | 'incorrect';
  partyStats: EffectivePartyStats;
  rng?: () => number;
}): {
  damage: number;
  isCritical: boolean;
} {
  if (params.classification === 'incorrect' || params.score < RPG_BALANCE.combat.partialScoreMin) {
    return { damage: 0, isCritical: false };
  }

  const clampedScore = Math.max(0, Math.min(1, params.score));
  const factor = params.classification === 'correct' ? 1 : clampedScore;
  const rand = params.rng ?? Math.random;

  const canCrit = clampedScore >= RPG_BALANCE.combat.minCritScoreThreshold;
  const isCritical = canCrit && rand() < params.partyStats.combinedCritChance;
  const critMult = isCritical ? params.partyStats.bestCritMultiplier : 1;

  const rawDamage = params.partyStats.totalBaseDamage * factor * critMult;
  return {
    damage: Math.max(1, Math.round(rawDamage)),
    isCritical,
  };
}

/**
 * Calcula o contra-ataque do chefe quando a resposta é incorreta (ou parcialmente fraca),
 * verificando individualmente a chance de parry dos heróis equipados.
 */
export function calculateBossCounterAttack(params: {
  bossAttackDamage: number;
  equippedHeroes: RpgHeroState[];
  activeEffects?: RpgActiveTempEffect[];
  rng?: () => number;
}): {
  parried: boolean;
  parriedByHeroId: string | null;
  parriedByHeroName: string | null;
  damageTakenPerHero: number;
} {
  const rand = params.rng ?? Math.random;
  const partyStats = computeEffectivePartyStats(params.equippedHeroes, params.activeEffects ?? []);

  // Verifica se algum herói equipado vivo executa parry
  const aliveHeroes = params.equippedHeroes.filter((h) => h.currentHp > 0);
  const extraParry = (params.activeEffects ?? [])
    .filter((e) => e.remainingTurns > 0)
    .reduce((acc, e) => acc + (e.bonusParryChance ?? 0), 0);

  for (const hero of aliveHeroes) {
    const itemParry = hero.equippedItemIds.reduce((acc, itemId) => {
      const def = getItemDefinition(itemId);
      return acc + (def?.effects.bonusParryChance ?? 0);
    }, 0);
    const effectiveParry = Math.min(
      RPG_BALANCE.levelUp.caps.parryChance,
      hero.parryChance + itemParry + extraParry
    );
    if (rand() < effectiveParry) {
      return {
        parried: true,
        parriedByHeroId: hero.id,
        parriedByHeroName: hero.name,
        damageTakenPerHero: 0,
      };
    }
  }

  const mitigated = Math.max(4, params.bossAttackDamage - partyStats.totalDefense);
  return {
    parried: false,
    parriedByHeroId: null,
    parriedByHeroName: null,
    damageTakenPerHero: Math.round(mitigated),
  };
}

/**
 * Aplica XP a um herói e processa level-ups conservadores (1 ponto de atributo por nível).
 */
export function applyXpToHero(hero: RpgHeroState, xpGain: number): {
  updated: RpgHeroState;
  levelsGained: number;
} {
  if (xpGain <= 0) {
    return { updated: hero, levelsGained: 0 };
  }

  let level = hero.level;
  let xp = hero.xp + xpGain;
  let unspentStatPoints = hero.unspentStatPoints;
  let levelsGained = 0;

  while (xp >= computeXpForNextLevel(level)) {
    xp -= computeXpForNextLevel(level);
    level += 1;
    levelsGained += 1;
    unspentStatPoints += RPG_BALANCE.levelUp.statPointPerLevel;
  }

  return {
    levelsGained,
    updated: {
      ...hero,
      level,
      xp,
      xpToNextLevel: computeXpForNextLevel(level),
      unspentStatPoints,
    },
  };
}

/**
 * Gasta 1 ponto de atributo escolhido manualmente pelo jogador ao subir de nível.
 */
export function spendHeroStatPoint(hero: RpgHeroState, stat: RpgStatKey): RpgHeroState {
  if (hero.unspentStatPoints <= 0) {
    throw new Error('Este herói não possui pontos de atributo disponíveis.');
  }

  const inc = RPG_BALANCE.levelUp.increments[stat];
  const next: RpgHeroState = {
    ...hero,
    unspentStatPoints: hero.unspentStatPoints - 1,
  };

  switch (stat) {
    case 'maxHp':
      next.maxHp += inc;
      next.currentHp += inc;
      break;
    case 'intelligence':
      next.intelligence += inc;
      break;
    case 'baseDamage':
      next.baseDamage += inc;
      break;
    case 'parryChance':
      next.parryChance = Math.min(
        RPG_BALANCE.levelUp.caps.parryChance,
        Number((next.parryChance + inc).toFixed(3))
      );
      break;
    case 'critChance':
      next.critChance = Math.min(
        RPG_BALANCE.levelUp.caps.critChance,
        Number((next.critChance + inc).toFixed(3))
      );
      break;
  }

  return next;
}

/**
 * Valida regras estritas de troca de heróis:
 * - Só permitida em checkpoints.
 * - Mínimo 1 e máximo 3 heróis equipados.
 * - Todos os heróis selecionados devem estar desbloqueados.
 */
export function validateHeroEquipChange(params: {
  isAtCheckpoint: boolean;
  allHeroes: RpgHeroState[];
  requestedHeroIds: string[];
}): { valid: true } | { valid: false; reason: string } {
  if (!params.isAtCheckpoint) {
    return {
      valid: false,
      reason: 'A troca de heróis equipados só é permitida em um Checkpoint.',
    };
  }

  const uniqueIds = Array.from(new Set(params.requestedHeroIds));
  if (uniqueIds.length === 0) {
    return {
      valid: false,
      reason: 'É obrigatório manter pelo menos 1 herói equipado no grupo.',
    };
  }
  if (uniqueIds.length > RPG_BALANCE.campaign.maxEquippedHeroes) {
    return {
      valid: false,
      reason: `O grupo pode ter no máximo ${RPG_BALANCE.campaign.maxEquippedHeroes} heróis equipados simultaneamente.`,
    };
  }

  const byId = new Map(params.allHeroes.map((h) => [h.id, h]));
  for (const id of uniqueIds) {
    const hero = byId.get(id);
    if (!hero) {
      return { valid: false, reason: 'Herói selecionado não encontrado na campanha.' };
    }
    if (!hero.isUnlocked) {
      return {
        valid: false,
        reason: `${hero.name} ainda não foi desbloqueado nesta campanha.`,
      };
    }
  }

  return { valid: true };
}

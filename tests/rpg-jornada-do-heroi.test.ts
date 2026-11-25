import { afterEach, describe, expect, it } from 'vitest';
import {
  computeXpForNextLevel,
  getEnemyTurnTimeLimitSec,
  RPG_BALANCE,
} from '@/lib/rpg/balance';
import { RPG_BOSSES } from '@/lib/rpg/data/bosses';
import { RPG_HERO_CLASSES } from '@/lib/rpg/data/heroes';
import { getItemDefinition } from '@/lib/rpg/data/items';
import { RPG_REGIONS } from '@/lib/rpg/data/regions';
import { evaluateBossAnswerHeuristic } from '@/lib/rpg/engine/boss-evaluator';
import {
  applyXpToHero,
  calculateBossCounterAttack,
  calculateBossDamage,
  computeEffectivePartyStats,
  computePartyHintsMax,
  consumePartyHint,
  eliminateWrongOptions,
  evaluateMultiChoiceCombatRatio,
  spendHeroStatPoint,
  validateHeroEquipChange,
} from '@/lib/rpg/engine/combat';
import {
  generateRegionMap,
  getAvailableNodeIds,
  validateRegionMapGraph,
} from '@/lib/rpg/engine/map-generator';
import {
  extractUsedQuestionCodesFromResolutions,
  pickNextRunQuestion,
} from '@/lib/rpg/engine/question-deck';
import { isRpgModuleEnabled } from '@/lib/rpg/feature-flag';
import type { RpgHeroState } from '@/types/rpg';

function makeHero(overrides: Partial<RpgHeroState> = {}): RpgHeroState {
  return {
    id: overrides.id ?? 'hero-1',
    campaignId: 'camp-1',
    heroClassId: overrides.heroClassId ?? 'warrior',
    name: overrides.name ?? 'Aldric, o Guardião',
    isUnlocked: overrides.isUnlocked ?? true,
    isEquipped: overrides.isEquipped ?? true,
    slotIndex: overrides.slotIndex ?? 1,
    level: overrides.level ?? 1,
    xp: overrides.xp ?? 0,
    xpToNextLevel: computeXpForNextLevel(overrides.level ?? 1),
    unspentStatPoints: overrides.unspentStatPoints ?? 0,
    maxHp: overrides.maxHp ?? 130,
    currentHp: overrides.currentHp ?? 130,
    intelligence: overrides.intelligence ?? 4,
    baseDamage: overrides.baseDamage ?? 24,
    parryChance: overrides.parryChance ?? 0.2,
    critChance: overrides.critChance ?? 0.2,
    critMultiplier: overrides.critMultiplier ?? 2.0,
    equippedItemIds: overrides.equippedItemIds ?? [],
  };
}

describe('Módulo RPG "Jornada do Herói" — Regras de Negócio, Mapas, Combate e Segurança', () => {
  const originalFlag = process.env.NEXT_PUBLIC_ENABLE_RPG_MODULE;

  afterEach(() => {
    if (originalFlag === undefined) {
      delete process.env.NEXT_PUBLIC_ENABLE_RPG_MODULE;
    } else {
      process.env.NEXT_PUBLIC_ENABLE_RPG_MODULE = originalFlag;
    }
  });

  it('permite ativar e desativar o módulo RPG pela feature flag', () => {
    delete process.env.NEXT_PUBLIC_ENABLE_RPG_MODULE;
    expect(isRpgModuleEnabled()).toBe(true);

    process.env.NEXT_PUBLIC_ENABLE_RPG_MODULE = 'false';
    expect(isRpgModuleEnabled()).toBe(false);

    process.env.NEXT_PUBLIC_ENABLE_RPG_MODULE = '0';
    expect(isRpgModuleEnabled()).toBe(false);

    process.env.NEXT_PUBLIC_ENABLE_RPG_MODULE = 'true';
    expect(isRpgModuleEnabled()).toBe(true);
  });

  it('inicia a campanha com exatamente 1 herói desbloqueado (Guerreiro)', () => {
    const starterHeroes = RPG_HERO_CLASSES.filter((h) => h.unlockedByDefault);
    expect(starterHeroes).toHaveLength(1);
    expect(starterHeroes[0].id).toBe('warrior');
  });

  it('bloqueia troca de heróis fora de checkpoints e impõe limite máximo de 3 heróis equipados', () => {
    const allHeroes = [
      makeHero({ id: 'h1', heroClassId: 'warrior', isUnlocked: true }),
      makeHero({ id: 'h2', heroClassId: 'mage', isUnlocked: true }),
      makeHero({ id: 'h3', heroClassId: 'rogue', isUnlocked: true }),
      makeHero({ id: 'h4', heroClassId: 'paladin', isUnlocked: true }),
    ];

    // Fora de checkpoint: sempre bloqueado
    const outside = validateHeroEquipChange({
      isAtCheckpoint: false,
      allHeroes,
      requestedHeroIds: ['h1', 'h2'],
    });
    expect(outside.valid).toBe(false);

    // Em checkpoint com 4 heróis: bloqueado (máx 3)
    const tooMany = validateHeroEquipChange({
      isAtCheckpoint: true,
      allHeroes,
      requestedHeroIds: ['h1', 'h2', 'h3', 'h4'],
    });
    expect(tooMany.valid).toBe(false);

    // Em checkpoint com até 3 heróis desbloqueados: permitido
    const valid = validateHeroEquipChange({
      isAtCheckpoint: true,
      allHeroes,
      requestedHeroIds: ['h1', 'h2', 'h3'],
    });
    expect(valid.valid).toBe(true);
  });

  it('calcula e consome dicas compartilhadas do grupo corretamente', () => {
    const party = [
      makeHero({ id: 'h1', intelligence: 4 }),
      makeHero({ id: 'h2', intelligence: 9 }),
      makeHero({ id: 'h3', intelligence: 5 }),
    ];
    expect(computePartyHintsMax(party)).toBe(18);

    const firstUse = consumePartyHint(18);
    expect(firstUse.allowed).toBe(true);
    expect(firstUse.nextHintsRemaining).toBe(17);

    const emptyUse = consumePartyHint(0);
    expect(emptyUse.allowed).toBe(false);
    expect(emptyUse.nextHintsRemaining).toBe(0);
  });

  it('garante que itens de eliminação (Comum=1, Raro=2) nunca removam a alternativa correta', () => {
    const commonItem = getItemDefinition('lens-elimination-common');
    const rareItem = getItemDefinition('prism-elimination-rare');
    expect(commonItem?.effects.eliminateWrongCount).toBe(1);
    expect(rareItem?.effects.eliminateWrongCount).toBe(2);

    const alternativas = { A: 'Op A', B: 'Op B', C: 'Op C', D: 'Op D', E: 'Op E' };

    for (let i = 0; i < 40; i++) {
      // Questão única (correta = C)
      const resSingle = eliminateWrongOptions({
        alternativas,
        respostaCorreta: 'C',
        count: 2,
      });
      expect(resSingle.newlyEliminated).toHaveLength(2);
      expect(resSingle.allEliminated).not.toContain('C');

      // Questão múltipla (corretas = B, D)
      const resMulti = eliminateWrongOptions({
        alternativas,
        respostaCorreta: ['B', 'D'],
        count: 2,
      });
      expect(resMulti.newlyEliminated).toHaveLength(2);
      expect(resMulti.allEliminated).not.toContain('B');
      expect(resMulti.allEliminated).not.toContain('D');
    }
  });

  it('calcula dano, resposta parcial, crítico e parry respeitando parâmetros configurados', () => {
    const hero = makeHero({ baseDamage: 30, critChance: 0.5, critMultiplier: 2.0, parryChance: 0.4 });
    const stats = computeEffectivePartyStats([hero]);

    // Correta sem crítico (rng = 0.9 > 0.5)
    const normalHit = calculateBossDamage({
      score: 0.95,
      classification: 'correct',
      partyStats: stats,
      rng: () => 0.9,
    });
    expect(normalHit.damage).toBe(30);
    expect(normalHit.isCritical).toBe(false);

    // Correta com crítico (rng = 0.1 < 0.5)
    const critHit = calculateBossDamage({
      score: 0.9,
      classification: 'correct',
      partyStats: stats,
      rng: () => 0.1,
    });
    expect(critHit.damage).toBe(60);
    expect(critHit.isCritical).toBe(true);

    // Parcial (0.6) não ativa crítico e causa dano proporcional
    const partialHit = calculateBossDamage({
      score: 0.6,
      classification: 'partial',
      partyStats: stats,
      rng: () => 0.01,
    });
    expect(partialHit.isCritical).toBe(false);
    expect(partialHit.damage).toBe(18);

    // Incorreta causa 0 de dano
    const missHit = calculateBossDamage({
      score: 0.2,
      classification: 'incorrect',
      partyStats: stats,
      rng: () => 0.01,
    });
    expect(missHit.damage).toBe(0);

    // Parry ativado (rng = 0.1 < 0.4) bloqueia 100% do dano do chefe
    const parried = calculateBossCounterAttack({
      bossAttackDamage: 25,
      equippedHeroes: [hero],
      rng: () => 0.1,
    });
    expect(parried.parried).toBe(true);
    expect(parried.damageTakenPerHero).toBe(0);

    // Sem parry (rng = 0.9 >= 0.4) aplica dano do chefe
    const hitTaken = calculateBossCounterAttack({
      bossAttackDamage: 25,
      equippedHeroes: [hero],
      rng: () => 0.9,
    });
    expect(hitTaken.parried).toBe(false);
    expect(hitTaken.damageTakenPerHero).toBe(25);
  });

  it('evolui herói com curva de XP e permite distribuir ponto manual de atributo', () => {
    const hero = makeHero({ level: 1, xp: 0, maxHp: 130, parryChance: 0.16 });
    const needed = computeXpForNextLevel(1);
    const { updated, levelsGained } = applyXpToHero(hero, needed + 10);

    expect(levelsGained).toBe(1);
    expect(updated.level).toBe(2);
    expect(updated.unspentStatPoints).toBe(1);
    expect(updated.maxHp).toBe(130); // Não aumenta vida automaticamente

    const evolved = spendHeroStatPoint(updated, 'parryChance');
    expect(evolved.unspentStatPoints).toBe(0);
    expect(evolved.parryChance).toBeCloseTo(0.16 + RPG_BALANCE.levelUp.increments.parryChance, 3);
  });

  it('posiciona chefes a cada 10 níveis e gera mapas determinísticos sem nós inacessíveis nem ciclos', () => {
    const sampleCodes = Array.from({ length: 45 }, (_, i) => `ID-${String(i + 1).padStart(3, '0')}`);

    expect(RPG_REGIONS).toHaveLength(4);
    for (const region of RPG_REGIONS) {
      const mapA = generateRegionMap({
        regionIndex: region.index,
        seed: 'fixed-seed-ireb-2026',
        availableQuestionCodes: sampleCodes,
      });
      const mapB = generateRegionMap({
        regionIndex: region.index,
        seed: 'fixed-seed-ireb-2026',
        availableQuestionCodes: sampleCodes,
      });

      // Determinístico
      expect(mapA).toEqual(mapB);

      // Chefe exatamente no múltiplo de 10 (10, 20, 30, 40)
      const bossNode = mapA.nodes.find((n) => n.id === mapA.bossNodeId);
      expect(bossNode?.type).toBe('boss');
      expect(bossNode?.globalLevel).toBe((region.index + 1) * 10);

      // Sem nós inacessíveis, alcança chefe e sem ciclos
      const validation = validateRegionMapGraph(mapA);
      expect(validation.valid).toBe(true);
      expect(validation.unreachableNodeIds).toHaveLength(0);
      expect(validation.hasCycle).toBe(false);
      expect(validation.reachesBoss).toBe(true);

      // Libera próximos nós ao concluir o nó inicial
      const availAfterStart = getAvailableNodeIds(mapA, [mapA.startNodeId]);
      expect(availAfterStart.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('avalia respostas discursivas estruturadas distinguindo correta, parcial e incorreta', () => {
    const bossPrompt = RPG_BOSSES[0].prompts[0];

    const strong = evaluateBossAnswerHeuristic(
      bossPrompt,
      'Um requisito funcional descreve o comportamento e as funções que o sistema deve executar, por exemplo emitir nota fiscal. Já um requisito de qualidade descreve atributos de desempenho, segurança e usabilidade, por exemplo responder em até 2 segundos.'
    );
    expect(strong.classification).toBe('correct');
    expect(strong.score).toBeGreaterThanOrEqual(0.8);

    const partial = evaluateBossAnswerHeuristic(
      bossPrompt,
      'O requisito funcional descreve o comportamento ou função que o sistema precisa oferecer aos usuários, por exemplo cadastrar pedidos no sistema.'
    );
    expect(partial.classification).toBe('partial');
    expect(partial.missingConcepts.length).toBeGreaterThan(0);

    const wrong = evaluateBossAnswerHeuristic(bossPrompt, 'Não sei responder.');
    expect(wrong.classification).toBe('incorrect');
    expect(wrong.score).toBeLessThan(0.4);
  });

  it('garante ao menos 60 segundos (1 minuto) no ENEMY TURN em todas as regiões e níveis', () => {
    for (let regionIndex = 0; regionIndex <= 3; regionIndex++) {
      for (const isElite of [false, true]) {
        for (let level = 1; level <= 10; level++) {
          const limit = getEnemyTurnTimeLimitSec(regionIndex, isElite, level);
          expect(limit).toBeGreaterThanOrEqual(60);
        }
      }
    }
  });

  it('sorteia aleatoriamente entre todas as 225 questões sem repetir na mesma run até esgotar a base', () => {
    const allQuestions = Array.from({ length: 225 }, (_, i) => ({
      codigo: `ID-${String(i + 1).padStart(3, '0')}`,
    }));

    const usedInRun: string[] = [];
    for (let i = 0; i < 225; i++) {
      const picked = pickNextRunQuestion(allQuestions, usedInRun);
      expect(usedInRun).not.toContain(picked.codigo);
      usedInRun.push(picked.codigo);
    }

    // Todas as 225 questões foram sorteadas exatamente 1 vez na run
    expect(new Set(usedInRun).size).toBe(225);

    // Após completar todas as 225, inicia um segundo ciclo sem repetir antes de fechar o 2º ciclo
    const secondCycle: string[] = [];
    for (let i = 0; i < 225; i++) {
      const picked = pickNextRunQuestion(allQuestions, [...usedInRun, ...secondCycle]);
      expect(secondCycle).not.toContain(picked.codigo);
      secondCycle.push(picked.codigo);
    }
    expect(new Set(secondCycle).size).toBe(225);
  });

  it('extrai corretamente o histórico de questões usadas a partir das resoluções da campanha', () => {
    const codes = extractUsedQuestionCodesFromResolutions([
      { question_codigo: 'ID-001', outcome_json: { encounter: { usedQuestionCodes: ['ID-001', 'ID-042', 'ID-199'] } } },
      { question_codigo: 'ID-120', outcome_json: {} },
    ]);
    expect(codes).toEqual(['ID-001', 'ID-042', 'ID-199', 'ID-120']);
  });

  it('divide proporcionalmente o dano em questões de múltipla escolha (2 e 3 alternativas corretas)', () => {
    // 2 corretas, acertou 1 -> hitRatio = 1/2, missRatio = 1/2
    const half = evaluateMultiChoiceCombatRatio(['A', 'B'], ['A', 'C']);
    expect(half.isPartialHit).toBe(true);
    expect(half.matchedCount).toBe(1);
    expect(half.correctCount).toBe(2);
    expect(half.hitRatio).toBeCloseTo(0.5, 5);
    expect(half.missRatio).toBeCloseTo(0.5, 5);

    // 3 corretas, acertou 1 -> hitRatio = 1/3, missRatio = 2/3
    const oneOfThree = evaluateMultiChoiceCombatRatio(['A', 'B', 'D'], ['A', 'C', 'E']);
    expect(oneOfThree.isPartialHit).toBe(true);
    expect(oneOfThree.matchedCount).toBe(1);
    expect(oneOfThree.correctCount).toBe(3);
    expect(oneOfThree.hitRatio).toBeCloseTo(1 / 3, 5);
    expect(oneOfThree.missRatio).toBeCloseTo(2 / 3, 5);

    // 3 corretas, acertou 2 -> hitRatio = 2/3, missRatio = 1/3
    const twoOfThree = evaluateMultiChoiceCombatRatio(['A', 'C', 'D'], ['A', 'C', 'E']);
    expect(twoOfThree.isPartialHit).toBe(true);
    expect(twoOfThree.hitRatio).toBeCloseTo(2 / 3, 5);
    expect(twoOfThree.missRatio).toBeCloseTo(1 / 3, 5);

    // Acerto total -> hitRatio = 1, missRatio = 0
    const full = evaluateMultiChoiceCombatRatio(['A', 'C'], ['A', 'C']);
    expect(full.isFullHit).toBe(true);
    expect(full.hitRatio).toBe(1);
    expect(full.missRatio).toBe(0);

    // Erro total -> isMiss = true, hitRatio = 0, missRatio = 1
    const miss = evaluateMultiChoiceCombatRatio(['B', 'D'], ['A', 'C']);
    expect(miss.isMiss).toBe(true);
    expect(miss.hitRatio).toBe(0);
    expect(miss.missRatio).toBe(1);

    // Anti-exploit: marcar todas as 4 opções quando só 2 são corretas anula os acertos extras
    const cheese = evaluateMultiChoiceCombatRatio(['A', 'B', 'C', 'D'], ['A', 'C']);
    expect(cheese.matchedCount).toBe(0);
    expect(cheese.isMiss).toBe(true);
  });
});

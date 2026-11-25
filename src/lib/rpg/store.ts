import crypto from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { generateWithFreeCascade, isAnyFreeAIConfigured } from '@/lib/ai-provider';
import { loadStaticSourceQuestions } from '@/lib/cloud-store';
import { evaluateAnswer } from '@/lib/evaluation';
import { retrieveOfficialIrebKnowledge } from '@/lib/ireb-knowledge';
import { computeXpForNextLevel, RPG_BALANCE, scaleXpByRegion } from '@/lib/rpg/balance';
import { getBossById, getBossByRegionIndex } from '@/lib/rpg/data/bosses';
import { getRegionIntroDialogue } from '@/lib/rpg/data/dialogues';
import { getEventById } from '@/lib/rpg/data/events';
import { RPG_HERO_CLASSES } from '@/lib/rpg/data/heroes';
import { getItemDefinition, getItemsByRarity } from '@/lib/rpg/data/items';
import { getRegionByIndex, RPG_REGIONS } from '@/lib/rpg/data/regions';
import { evaluateBossDiscursiveAnswer } from '@/lib/rpg/engine/boss-evaluator';
import {
  applyXpToHero,
  calculateBossCounterAttack,
  calculateBossDamage,
  computeEffectivePartyStats,
  computePartyHintsMax,
  consumePartyHint,
  eliminateWrongOptions,
  spendHeroStatPoint,
  validateHeroEquipChange,
} from '@/lib/rpg/engine/combat';
import { generateRegionMap, getAvailableNodeIds } from '@/lib/rpg/engine/map-generator';
import { isRpgModuleEnabled } from '@/lib/rpg/feature-flag';
import { DEFAULT_QUESTION_TOPIC_MAP } from '@/lib/taxonomy';
import type {
  RpgActiveTempEffect,
  RpgBossBattleState,
  RpgBossEvaluation,
  RpgBossTurnRecord,
  RpgCampaignSnapshot,
  RpgCampaignState,
  RpgHeroClassId,
  RpgHeroState,
  RpgInventoryEntry,
  RpgMapNode,
  RpgRarity,
  RpgRegionId,
  RpgRegionMapGraph,
  RpgRegionMapState,
  RpgStageEncounterState,
  RpgStageEnemy,
  RpgStatKey,
} from '@/types/rpg';

function buildStageEnemies(
  regionId: RpgRegionId,
  isElite: boolean,
  regionIndex: number,
  nodeLevel: number
): RpgStageEnemy[] {
  // Escalada progressiva de HP e dano (~3 erros por herói vivo = derrota)
  const levelStep = Math.max(0, nodeLevel - 2);
  const hpScale = regionIndex * 18 + levelStep * 5;
  const atkScale = regionIndex * 5 + Math.floor(levelStep * 1.5);
  const hasThirdEnemy = isElite || nodeLevel >= 6 || regionIndex >= 2;

  const roster: Record<RpgRegionId, Array<{ name: string; sprite: string; hpBase: number; atkBase: number; elite?: boolean }>> = {
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

function getEnemyTurnTimeLimitSec(regionIndex: number, isElite: boolean, nodeLevel: number): number {
  const base = isElite ? 18 : 22;
  return Math.max(12, base - regionIndex * 2 - (nodeLevel >= 7 ? 2 : 0));
}

function pickNextStageQuestionCode(regionIndex: number, usedCodes: string[]): string {
  const region = getRegionByIndex(regionIndex);
  const all = loadStaticSourceQuestions();
  const usedSet = new Set(usedCodes);
  const topicMatches = all.filter(
    (q) => !usedSet.has(q.codigo) && region.topicIds.includes(DEFAULT_QUESTION_TOPIC_MAP[q.codigo] ?? '')
  );
  const pool = topicMatches.length > 0 ? topicMatches : all.filter((q) => !usedSet.has(q.codigo));
  const finalPool = pool.length > 0 ? pool : all;
  return finalPool[Math.floor(Math.random() * finalPool.length)].codigo;
}

function toSafeClientQuestion(codigo: string) {
  const all = loadStaticSourceQuestions();
  const q = all.find((item) => item.codigo === codigo) ?? all[0];
  return {
    codigo: q.codigo,
    numero: q.numero,
    enunciado: q.enunciado,
    tipo: q.tipo,
    quantidade_respostas: q.quantidade_respostas,
    alternativas: q.alternativas,
    managedImageUrl: q.managedImageUrl,
  };
}

function mapCampaignRow(row: Record<string, unknown>): RpgCampaignState {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    name: String(row.name),
    status: row.status === 'completed' ? 'completed' : 'active',
    currentRegionIndex: Number(row.current_region_index ?? 0),
    currentNodeId: String(row.current_node_id),
    unlockedRegionIndex: Number(row.unlocked_region_index ?? 0),
    hintsRemaining: Number(row.hints_remaining ?? 4),
    hintsMax: Number(row.hints_max ?? 4),
    gold: Number(row.gold ?? 0),
    seed: String(row.seed),
    activeEffects: Array.isArray(row.active_effects_json)
      ? (row.active_effects_json as RpgActiveTempEffect[])
      : [],
    seenDialogueIds: Array.isArray(row.seen_dialogues_json)
      ? (row.seen_dialogues_json as string[])
      : [],
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mapRegionMapRow(row: Record<string, unknown>): RpgRegionMapState {
  return {
    id: String(row.id),
    campaignId: String(row.campaign_id),
    regionIndex: Number(row.region_index),
    regionId: String(row.region_id) as RpgRegionId,
    seed: String(row.seed),
    graph: row.graph_json as RpgRegionMapGraph,
    completedNodeIds: Array.isArray(row.completed_node_ids)
      ? (row.completed_node_ids as string[])
      : [],
    status: (row.status as 'locked' | 'active' | 'completed') ?? 'locked',
  };
}

function mapHeroRow(row: Record<string, unknown>): RpgHeroState {
  const level = Number(row.level ?? 1);
  return {
    id: String(row.id),
    campaignId: String(row.campaign_id),
    heroClassId: String(row.hero_class_id) as RpgHeroClassId,
    name: String(row.name),
    isUnlocked: Boolean(row.is_unlocked),
    isEquipped: Boolean(row.is_equipped),
    slotIndex: row.slot_index !== null && row.slot_index !== undefined ? Number(row.slot_index) : null,
    level,
    xp: Number(row.xp ?? 0),
    xpToNextLevel: computeXpForNextLevel(level),
    unspentStatPoints: Number(row.unspent_stat_points ?? 0),
    maxHp: Number(row.max_hp),
    currentHp: Number(row.current_hp),
    intelligence: Number(row.intelligence),
    baseDamage: Number(row.base_damage),
    parryChance: Number(row.parry_chance),
    critChance: Number(row.crit_chance),
    critMultiplier: Number(row.crit_multiplier),
    equippedItemIds: Array.isArray(row.equipped_item_ids)
      ? (row.equipped_item_ids as string[])
      : [],
  };
}

function mapInventoryRow(row: Record<string, unknown>): RpgInventoryEntry {
  return {
    id: String(row.id),
    campaignId: String(row.campaign_id),
    itemId: String(row.item_id),
    quantity: Number(row.quantity ?? 0),
    equippedByHeroId: row.equipped_by_hero_id ? String(row.equipped_by_hero_id) : null,
  };
}

async function grantInventoryItem(
  supabase: SupabaseClient,
  userId: string,
  campaignId: string,
  itemId: string,
  amount = 1
): Promise<void> {
  const def = getItemDefinition(itemId);
  if (!def || amount <= 0) return;

  const { data: existing } = await supabase
    .from('rpg_inventory_items')
    .select('*')
    .eq('campaign_id', campaignId)
    .eq('item_id', itemId)
    .is('equipped_by_hero_id', null)
    .maybeSingle();

  if (existing) {
    const nextQty = Math.min(def.maxStack, Number(existing.quantity ?? 0) + amount);
    await supabase
      .from('rpg_inventory_items')
      .update({ quantity: nextQty, updated_at: new Date().toISOString() })
      .eq('id', existing.id);
  } else {
    await supabase.from('rpg_inventory_items').insert({
      campaign_id: campaignId,
      user_id: userId,
      item_id: itemId,
      quantity: Math.min(def.maxStack, amount),
      equipped_by_hero_id: null,
    });
  }
}

async function awardXpToEquippedHeroes(
  supabase: SupabaseClient,
  equippedHeroes: RpgHeroState[],
  xpGain: number
): Promise<{ levelsGainedTotal: number }> {
  if (xpGain <= 0) return { levelsGainedTotal: 0 };
  let levelsGainedTotal = 0;

  for (const hero of equippedHeroes) {
    const { updated, levelsGained } = applyXpToHero(hero, xpGain);
    levelsGainedTotal += levelsGained;
    await supabase
      .from('rpg_heroes')
      .update({
        level: updated.level,
        xp: updated.xp,
        unspent_stat_points: updated.unspentStatPoints,
        updated_at: new Date().toISOString(),
      })
      .eq('id', hero.id);
  }

  return { levelsGainedTotal };
}

export async function createNewRpgCampaign(
  supabase: SupabaseClient,
  userId: string,
  campaignName = 'Jornada do Herói — CPRE-FL'
): Promise<RpgCampaignState> {
  const seed = crypto.randomBytes(8).toString('hex');
  const allQuestionCodes = loadStaticSourceQuestions().map((q) => q.codigo);

  const maps = RPG_REGIONS.map((region) =>
    generateRegionMap({
      regionIndex: region.index,
      seed,
      availableQuestionCodes: allQuestionCodes,
    })
  );

  const starterHeroDef = RPG_HERO_CLASSES.find((h) => h.unlockedByDefault) ?? RPG_HERO_CLASSES[0];
  const initialHints = Math.max(RPG_BALANCE.hints.minPoolFloor, starterHeroDef.baseStats.intelligence);

  const { data: campRow, error: campErr } = await supabase
    .from('rpg_campaigns')
    .insert({
      user_id: userId,
      name: campaignName,
      status: 'active',
      current_region_index: 0,
      current_node_id: maps[0].startNodeId,
      unlocked_region_index: 0,
      hints_remaining: initialHints,
      hints_max: initialHints,
      gold: RPG_BALANCE.campaign.startingGold,
      seed,
      active_effects_json: [],
      seen_dialogues_json: [],
    })
    .select('*')
    .single();

  if (campErr || !campRow) {
    throw new Error(campErr?.message ?? 'Falha ao criar campanha RPG.');
  }

  const campaignId = String(campRow.id);

  // Insere os mapas das 4 regiões (nó inicial da região 0 já nasce concluído para liberar bifurcação do nível 2)
  await supabase.from('rpg_region_maps').insert(
    maps.map((graph) => ({
      campaign_id: campaignId,
      user_id: userId,
      region_index: graph.regionIndex,
      region_id: graph.regionId,
      seed: graph.seed,
      graph_json: graph,
      completed_node_ids: graph.regionIndex === 0 ? [graph.startNodeId] : [],
      status: graph.regionIndex === 0 ? 'active' : 'locked',
    }))
  );

  // Insere todos os heróis: apenas o Guerreiro começa desbloqueado e equipado no slot 1
  await supabase.from('rpg_heroes').insert(
    RPG_HERO_CLASSES.map((cls) => ({
      campaign_id: campaignId,
      user_id: userId,
      hero_class_id: cls.id,
      name: cls.name,
      is_unlocked: cls.unlockedByDefault,
      is_equipped: cls.unlockedByDefault,
      slot_index: cls.unlockedByDefault ? 1 : null,
      level: 1,
      xp: 0,
      unspent_stat_points: 0,
      max_hp: cls.baseStats.maxHp,
      current_hp: cls.baseStats.maxHp,
      intelligence: cls.baseStats.intelligence,
      base_damage: cls.baseStats.baseDamage,
      parry_chance: cls.baseStats.parryChance,
      crit_chance: cls.baseStats.critChance,
      crit_multiplier: cls.baseStats.critMultiplier,
      equipped_item_ids: [],
    }))
  );

  // Sem itens grátis iniciais — itens, melhorias e recargas são conquistados nos baús após vencer fases!
  return mapCampaignRow(campRow);
}

export async function resetRpgCampaign(
  supabase: SupabaseClient,
  userId: string
): Promise<RpgCampaignSnapshot> {
  await supabase.from('rpg_campaigns').delete().eq('user_id', userId);
  await createNewRpgCampaign(supabase, userId);
  return getOrCreateCampaignSnapshot(supabase, userId);
}

export async function getOrCreateCampaignSnapshot(
  supabase: SupabaseClient,
  userId: string
): Promise<RpgCampaignSnapshot> {
  const { data: existingRows } = await supabase
    .from('rpg_campaigns')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1);

  const campaign =
    existingRows && existingRows.length > 0
      ? mapCampaignRow(existingRows[0])
      : await createNewRpgCampaign(supabase, userId);

  const [mapsRes, heroesRes, invRes, battleRes, resolutionsRes] = await Promise.all([
    supabase
      .from('rpg_region_maps')
      .select('*')
      .eq('campaign_id', campaign.id)
      .order('region_index', { ascending: true }),
    supabase
      .from('rpg_heroes')
      .select('*')
      .eq('campaign_id', campaign.id)
      .order('created_at', { ascending: true }),
    supabase
      .from('rpg_inventory_items')
      .select('*')
      .eq('campaign_id', campaign.id)
      .gt('quantity', 0),
    supabase
      .from('rpg_boss_battles')
      .select('*')
      .eq('campaign_id', campaign.id)
      .eq('status', 'in_progress')
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('rpg_node_resolutions')
      .select('node_type, xp_awarded')
      .eq('campaign_id', campaign.id),
  ]);

  const regionMaps = (mapsRes.data ?? []).map(mapRegionMapRow);
  const currentMap =
    regionMaps.find((m) => m.regionIndex === campaign.currentRegionIndex) ?? regionMaps[0];
  const heroes = (heroesRes.data ?? []).map(mapHeroRow);
  const inventory = (invRes.data ?? []).map(mapInventoryRow);

  let activeBossBattle: RpgBossBattleState | null = null;
  if (battleRes.data) {
    const bRow = battleRes.data;
    const bossDef = getBossById(String(bRow.boss_id));
    const { data: turnRows } = await supabase
      .from('rpg_boss_turns')
      .select('*')
      .eq('battle_id', bRow.id)
      .order('turn_number', { ascending: true });

    const currentPrompt =
      bossDef.prompts.find((p) => p.id === String(bRow.current_prompt_id)) ?? bossDef.prompts[0];

    activeBossBattle = {
      id: String(bRow.id),
      campaignId: campaign.id,
      regionIndex: Number(bRow.region_index),
      bossId: bossDef.id,
      status: bRow.status as 'in_progress' | 'victory' | 'defeat',
      bossMaxHp: Number(bRow.boss_max_hp),
      bossCurrentHp: Number(bRow.boss_current_hp),
      turnNumber: Number(bRow.turn_number),
      currentPrompt,
      usedPromptIds: Array.isArray(bRow.used_prompt_ids) ? (bRow.used_prompt_ids as string[]) : [],
      turns: (turnRows ?? []).map((t) => ({
        id: String(t.id),
        battleId: String(t.battle_id),
        turnNumber: Number(t.turn_number),
        promptId: String(t.prompt_id),
        promptQuestion: String(t.prompt_question),
        playerAnswer: String(t.player_answer),
        evaluation: t.evaluation_json as RpgBossEvaluation,
        damageDealt: Number(t.damage_dealt),
        isCritical: Boolean(t.is_critical),
        bossDamageDealt: Number(t.boss_damage_dealt),
        parriedByHeroId: t.parried_by_hero_id ? String(t.parried_by_hero_id) : null,
        parriedByHeroName: t.parried_by_hero_name ? String(t.parried_by_hero_name) : null,
        createdAt: String(t.created_at),
      })),
    };
  }

  const currentRegion = getRegionByIndex(campaign.currentRegionIndex);
  const introScene = getRegionIntroDialogue(currentRegion.id);
  const pendingDialogue = campaign.seenDialogueIds.includes(introScene.id) ? null : introScene;

  const resolutions = resolutionsRes.data ?? [];
  const totalNodesCompleted = regionMaps.reduce((acc, m) => acc + m.completedNodeIds.length, 0);
  const bossesDefeated = resolutions.filter((r) => r.node_type === 'boss').length;
  const totalXpEarned = resolutions.reduce((acc, r) => acc + Number(r.xp_awarded ?? 0), 0);

  return {
    enabled: isRpgModuleEnabled(),
    campaign,
    regions: RPG_REGIONS,
    regionMaps,
    currentMap,
    heroes,
    inventory,
    activeBossBattle,
    pendingDialogue,
    stats: {
      totalNodesCompleted,
      bossesDefeated,
      totalXpEarned,
    },
  };
}

export async function markRpgDialogueSeen(
  supabase: SupabaseClient,
  userId: string,
  dialogueId: string
): Promise<RpgCampaignSnapshot> {
  const snapshot = await getOrCreateCampaignSnapshot(supabase, userId);
  if (!snapshot.campaign.seenDialogueIds.includes(dialogueId)) {
    const nextSeen = [...snapshot.campaign.seenDialogueIds, dialogueId];
    await supabase
      .from('rpg_campaigns')
      .update({ seen_dialogues_json: nextSeen, updated_at: new Date().toISOString() })
      .eq('id', snapshot.campaign.id);
  }
  return getOrCreateCampaignSnapshot(supabase, userId);
}

export async function switchRpgRegion(
  supabase: SupabaseClient,
  userId: string,
  regionIndex: number
): Promise<RpgCampaignSnapshot> {
  const snapshot = await getOrCreateCampaignSnapshot(supabase, userId);
  if (regionIndex < 0 || regionIndex > snapshot.campaign.unlockedRegionIndex) {
    throw new Error('Esta região ainda está bloqueada. Derrote o chefe da região anterior primeiro.');
  }
  const targetMap = snapshot.regionMaps.find((m) => m.regionIndex === regionIndex);
  if (!targetMap) {
    throw new Error('Mapa da região não encontrado.');
  }

  // Garante que o nó inicial da região selecionada esteja marcado como concluído para liberar escolhas
  if (targetMap.completedNodeIds.length === 0) {
    await supabase
      .from('rpg_region_maps')
      .update({
        completed_node_ids: [targetMap.graph.startNodeId],
        status: targetMap.status === 'completed' ? 'completed' : 'active',
        updated_at: new Date().toISOString(),
      })
      .eq('id', targetMap.id);
  }

  const lastCompleted =
    targetMap.completedNodeIds[targetMap.completedNodeIds.length - 1] ?? targetMap.graph.startNodeId;

  await supabase
    .from('rpg_campaigns')
    .update({
      current_region_index: regionIndex,
      current_node_id: lastCompleted,
      updated_at: new Date().toISOString(),
    })
    .eq('id', snapshot.campaign.id);

  return getOrCreateCampaignSnapshot(supabase, userId);
}

export async function selectRpgMapNode(
  supabase: SupabaseClient,
  userId: string,
  nodeId: string
): Promise<{
  node: RpgMapNode;
  alreadyCompleted: boolean;
  question?: ReturnType<typeof toSafeClientQuestion>;
  encounter?: RpgStageEncounterState;
  event?: ReturnType<typeof getEventById>;
  chestReward?: { itemId: string; itemName: string; gold: number; xp: number };
  bossBattle?: RpgBossBattleState;
  snapshot: RpgCampaignSnapshot;
}> {
  const snapshot = await getOrCreateCampaignSnapshot(supabase, userId);
  const { campaign, currentMap } = snapshot;

  const node = currentMap.graph.nodes.find((n) => n.id === nodeId);
  if (!node) {
    throw new Error('Nó não encontrado no mapa da região atual.');
  }

  const alreadyCompleted = currentMap.completedNodeIds.includes(node.id);
  const availableIds = getAvailableNodeIds(currentMap.graph, currentMap.completedNodeIds);

  // Permite reabrir checkpoints já alcançados para gerenciar heróis/descansar
  if (!alreadyCompleted && !availableIds.includes(node.id)) {
    throw new Error('Este ponto do mapa ainda não está acessível. Avance por um caminho conectado.');
  }

  await supabase
    .from('rpg_campaigns')
    .update({ current_node_id: node.id, updated_at: new Date().toISOString() })
    .eq('id', campaign.id);

  if (node.type === 'question' || node.type === 'special') {
    const region = getRegionByIndex(campaign.currentRegionIndex);

    // Verifica se já existe um combate de fase em andamento para este nó
    const { data: existingRes } = await supabase
      .from('rpg_node_resolutions')
      .select('*')
      .eq('campaign_id', campaign.id)
      .eq('region_index', campaign.currentRegionIndex)
      .eq('node_id', node.id)
      .maybeSingle();

    let encounter: RpgStageEncounterState | null = null;
    if (existingRes) {
      const saved = (existingRes.outcome_json as { encounter?: RpgStageEncounterState } | null)?.encounter;
      if (saved && saved.status === 'in_progress') {
        encounter = saved;
      }
    }

    if (!encounter) {
      const firstCode = node.questionCodigo || pickNextStageQuestionCode(campaign.currentRegionIndex, []);
      encounter = {
        nodeId: node.id,
        status: 'in_progress',
        phase: 'hero_turn',
        attackingEnemyId: null,
        turnTimeLimitSec: null,
        turnStartedAt: null,
        turnNumber: 1,
        enemies: buildStageEnemies(region.id, node.type === 'special', campaign.currentRegionIndex, node.level),
        currentQuestionCodigo: firstCode,
        usedQuestionCodes: [firstCode],
      };

      if (existingRes) {
        await supabase
          .from('rpg_node_resolutions')
          .update({
            question_codigo: firstCode,
            outcome_json: { isCorrect: false, encounter },
            rewards_json: { gold: 0, chestClaimed: false },
          })
          .eq('id', existingRes.id);
      } else {
        await supabase.from('rpg_node_resolutions').insert({
          campaign_id: campaign.id,
          user_id: userId,
          region_index: campaign.currentRegionIndex,
          node_id: node.id,
          node_type: node.type,
          question_codigo: firstCode,
          outcome_json: { isCorrect: false, encounter },
          xp_awarded: 0,
          rewards_json: { gold: 0, chestClaimed: false },
        });
      }
    }

    const updatedSnap = await getOrCreateCampaignSnapshot(supabase, userId);
    return {
      node,
      alreadyCompleted,
      question: toSafeClientQuestion(encounter.currentQuestionCodigo),
      encounter,
      snapshot: updatedSnap,
    };
  }

  if (node.type === 'event' || node.type === 'gap') {
    const event = getEventById(node.eventId ?? '');
    const updatedSnap = await getOrCreateCampaignSnapshot(supabase, userId);
    return { node, alreadyCompleted, event, snapshot: updatedSnap };
  }

  if (node.type === 'chest') {
    // Idempotente via rpg_node_resolutions
    const { data: prevRes } = await supabase
      .from('rpg_node_resolutions')
      .select('rewards_json')
      .eq('campaign_id', campaign.id)
      .eq('region_index', campaign.currentRegionIndex)
      .eq('node_id', node.id)
      .maybeSingle();

    if (prevRes) {
      const updatedSnap = await getOrCreateCampaignSnapshot(supabase, userId);
      return {
        node,
        alreadyCompleted: true,
        chestReward: prevRes.rewards_json as { itemId: string; itemName: string; gold: number; xp: number },
        snapshot: updatedSnap,
      };
    }

    const tier: RpgRarity = node.chestLootTier ?? 'uncommon';
    const pool = getItemsByRarity(tier);
    const chosen = pool[Math.floor(Math.random() * pool.length)] ?? getItemDefinition('potion-minor-heal')!;
    const gold = 25 + campaign.currentRegionIndex * 15;
    const xp = scaleXpByRegion(RPG_BALANCE.xp.rewards.chestBase, campaign.currentRegionIndex);

    await grantInventoryItem(supabase, userId, campaign.id, chosen.id, 1);
    const equipped = snapshot.heroes.filter((h) => h.isEquipped);
    await awardXpToEquippedHeroes(supabase, equipped, xp);

    const chestReward = { itemId: chosen.id, itemName: chosen.name, gold, xp };
    await supabase.from('rpg_node_resolutions').insert({
      campaign_id: campaign.id,
      user_id: userId,
      region_index: campaign.currentRegionIndex,
      node_id: node.id,
      node_type: 'chest',
      outcome_json: { opened: true },
      xp_awarded: xp,
      rewards_json: chestReward,
    });

    await supabase
      .from('rpg_campaigns')
      .update({ gold: campaign.gold + gold, updated_at: new Date().toISOString() })
      .eq('id', campaign.id);

    const nextCompleted = Array.from(new Set([...currentMap.completedNodeIds, node.id]));
    await supabase
      .from('rpg_region_maps')
      .update({ completed_node_ids: nextCompleted, updated_at: new Date().toISOString() })
      .eq('id', currentMap.id);

    const updatedSnap = await getOrCreateCampaignSnapshot(supabase, userId);
    return { node, alreadyCompleted: false, chestReward, snapshot: updatedSnap };
  }

  if (node.type === 'boss') {
    const bossDef = getBossByRegionIndex(campaign.currentRegionIndex);
    let activeBattle = snapshot.activeBossBattle;
    if (!activeBattle || activeBattle.regionIndex !== campaign.currentRegionIndex) {
      const firstPrompt = bossDef.prompts[0];
      await supabase.from('rpg_boss_battles').insert({
        campaign_id: campaign.id,
        user_id: userId,
        region_index: campaign.currentRegionIndex,
        boss_id: bossDef.id,
        status: 'in_progress',
        boss_max_hp: bossDef.maxHp,
        boss_current_hp: bossDef.maxHp,
        turn_number: 1,
        current_prompt_id: firstPrompt.id,
        used_prompt_ids: [firstPrompt.id],
      });
    }
    const updatedSnap = await getOrCreateCampaignSnapshot(supabase, userId);
    return {
      node,
      alreadyCompleted,
      bossBattle: updatedSnap.activeBossBattle ?? undefined,
      snapshot: updatedSnap,
    };
  }

  // Checkpoint ou Start
  if (node.type === 'checkpoint' && !alreadyCompleted) {
    const nextCompleted = Array.from(new Set([...currentMap.completedNodeIds, node.id]));
    await supabase
      .from('rpg_region_maps')
      .update({ completed_node_ids: nextCompleted, updated_at: new Date().toISOString() })
      .eq('id', currentMap.id);
  }

  const updatedSnap = await getOrCreateCampaignSnapshot(supabase, userId);
  return { node, alreadyCompleted, snapshot: updatedSnap };
}

export async function answerRpgChallengeNode(
  supabase: SupabaseClient,
  userId: string,
  nodeId: string,
  selectedAnswers: string[],
  targetEnemyId?: string,
  timedOut = false
): Promise<{
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
  alreadyResolved: boolean;
  encounterStatus: 'in_progress' | 'victory' | 'defeat';
  encounter: RpgStageEncounterState;
  nextQuestion: ReturnType<typeof toSafeClientQuestion> | null;
  rewardChestAvailable: boolean;
  rewardChestStyle: 'wood' | 'gold';
  snapshot: RpgCampaignSnapshot;
}> {
  const snapshot = await getOrCreateCampaignSnapshot(supabase, userId);
  const { campaign, currentMap, heroes } = snapshot;

  const node = currentMap.graph.nodes.find((n) => n.id === nodeId);
  if (!node || (node.type !== 'question' && node.type !== 'special')) {
    throw new Error('Nó de desafio inválido.');
  }

  const region = getRegionByIndex(campaign.currentRegionIndex);
  const isSpecial = node.type === 'special';

  const { data: existing } = await supabase
    .from('rpg_node_resolutions')
    .select('*')
    .eq('campaign_id', campaign.id)
    .eq('region_index', campaign.currentRegionIndex)
    .eq('node_id', node.id)
    .maybeSingle();

  const existingOutcome = (existing?.outcome_json ?? {}) as {
    isCorrect?: boolean;
    encounter?: RpgStageEncounterState;
  };
  const existingRewards = (existing?.rewards_json ?? {}) as {
    gold?: number;
    chestClaimed?: boolean;
  };

  if (existing && existingOutcome.encounter?.status === 'victory') {
    const q = loadStaticSourceQuestions().find(
      (item) => item.codigo === existingOutcome.encounter!.currentQuestionCodigo
    ) ?? loadStaticSourceQuestions()[0];
    return {
      isCorrect: true,
      wasEnemyTurn: false,
      attackBlocked: false,
      timedOut: false,
      correctAnswers: Array.isArray(q.resposta_correta) ? q.resposta_correta : [q.resposta_correta],
      explanation: q.explicacao,
      damageDealt: 0,
      isCritical: false,
      targetEnemyName: null,
      parriedByHeroName: null,
      xpAwarded: Number(existing.xp_awarded ?? 0),
      hpPenalty: 0,
      goldAwarded: Number(existingRewards.gold ?? 0),
      alreadyResolved: true,
      encounterStatus: 'victory',
      encounter: existingOutcome.encounter,
      nextQuestion: null,
      rewardChestAvailable: !existingRewards.chestClaimed,
      rewardChestStyle: isSpecial ? 'gold' : 'wood',
      snapshot,
    };
  }

  const encounter: RpgStageEncounterState =
    existingOutcome.encounter && existingOutcome.encounter.status === 'in_progress'
      ? {
          ...existingOutcome.encounter,
          phase: existingOutcome.encounter.phase ?? 'hero_turn',
          attackingEnemyId: existingOutcome.encounter.attackingEnemyId ?? null,
          turnTimeLimitSec: existingOutcome.encounter.turnTimeLimitSec ?? null,
          turnStartedAt: existingOutcome.encounter.turnStartedAt ?? null,
          enemies: existingOutcome.encounter.enemies.map((e) => ({ ...e })),
          usedQuestionCodes: [...existingOutcome.encounter.usedQuestionCodes],
        }
      : {
          nodeId: node.id,
          status: 'in_progress',
          phase: 'hero_turn',
          attackingEnemyId: null,
          turnTimeLimitSec: null,
          turnStartedAt: null,
          turnNumber: 1,
          enemies: buildStageEnemies(region.id, isSpecial, campaign.currentRegionIndex, node.level),
          currentQuestionCodigo: node.questionCodigo || pickNextStageQuestionCode(campaign.currentRegionIndex, []),
          usedQuestionCodes: [node.questionCodigo || 'ID-001'],
        };

  const allQuestions = loadStaticSourceQuestions();
  const question =
    allQuestions.find((q) => q.codigo === encounter.currentQuestionCodigo) ?? allQuestions[0];

  const wasEnemyTurn = encounter.phase === 'enemy_turn';

  // Verifica se o tempo do turno de ataque do inimigo esgotou
  let effectiveTimedOut = timedOut;
  if (wasEnemyTurn && encounter.turnStartedAt && encounter.turnTimeLimitSec) {
    const elapsedSec = (Date.now() - new Date(encounter.turnStartedAt).getTime()) / 1000;
    if (elapsedSec > encounter.turnTimeLimitSec + 3) {
      effectiveTimedOut = true;
    }
  }

  const evalRes = effectiveTimedOut
    ? {
        isCorrect: false,
        normalizedSelected: [] as string[],
        normalizedCorrect: Array.isArray(question.resposta_correta)
          ? question.resposta_correta
          : [question.resposta_correta],
      }
    : evaluateAnswer(selectedAnswers, question.resposta_correta);

  const equipped = heroes.filter((h) => h.isEquipped);
  const partyStats = computeEffectivePartyStats(equipped, campaign.activeEffects);

  let damageDealt = 0;
  let isCritical = false;
  let targetEnemyName: string | null = null;
  let parriedByHeroName: string | null = null;
  let attackBlocked = false;
  let hpPenalty = 0;
  let xpAwarded = 0;
  let goldAwarded = 0;

  if (wasEnemyTurn) {
    // TURNO DE ATAQUE DO INIMIGO: responder certo antes do tempo = BLOQUEIO TOTAL!
    const attacker =
      encounter.enemies.find((e) => e.id === encounter.attackingEnemyId && e.currentHp > 0) ??
      encounter.enemies.find((e) => e.currentHp > 0);
    targetEnemyName = attacker?.name ?? null;

    if (evalRes.isCorrect && !effectiveTimedOut) {
      attackBlocked = true;
    } else {
      // Errou ou tempo acabou -> toma dano pesado do inimigo atacante!
      const rawAtk = attacker?.attackDamage ?? 30;
      const counter = effectiveTimedOut
        ? { parried: false, parriedByHeroName: null, damageTakenPerHero: Math.max(12, rawAtk - partyStats.totalDefense) }
        : calculateBossCounterAttack({
            bossAttackDamage: rawAtk,
            equippedHeroes: equipped,
            activeEffects: campaign.activeEffects,
          });

      if (counter.parried) {
        parriedByHeroName = counter.parriedByHeroName;
      } else {
        hpPenalty = counter.damageTakenPerHero;
        for (const hero of equipped) {
          const nextHp = Math.max(0, hero.currentHp - hpPenalty);
          hero.currentHp = nextHp;
          await supabase
            .from('rpg_heroes')
            .update({ current_hp: nextHp, updated_at: new Date().toISOString() })
            .eq('id', hero.id);
        }
      }
    }
  } else if (evalRes.isCorrect) {
    // TURNO DO HERÓI (ACERTO) -> Ataca o inimigo alvo
    const target =
      encounter.enemies.find((e) => e.id === targetEnemyId && e.currentHp > 0) ??
      encounter.enemies.find((e) => e.currentHp > 0);

    if (target) {
      const hit = calculateBossDamage({
        score: 1,
        classification: 'correct',
        partyStats,
      });
      damageDealt = hit.damage;
      isCritical = hit.isCritical;
      targetEnemyName = target.name;
      target.currentHp = Math.max(0, target.currentHp - damageDealt);
    }
  } else {
    // TURNO DO HERÓI (ERRO) -> Contra-ataque imediato dos inimigos vivos (~1/3 do HP)
    const aliveEnemies = encounter.enemies.filter((e) => e.currentHp > 0);
    const avgAtk = Math.round(
      aliveEnemies.reduce((acc, e) => acc + e.attackDamage, 0) / Math.max(1, aliveEnemies.length)
    );
    const counter = calculateBossCounterAttack({
      bossAttackDamage: avgAtk,
      equippedHeroes: equipped,
      activeEffects: campaign.activeEffects,
    });

    if (counter.parried) {
      parriedByHeroName = counter.parriedByHeroName;
    } else {
      hpPenalty = counter.damageTakenPerHero;
      for (const hero of equipped) {
        const nextHp = Math.max(0, hero.currentHp - hpPenalty);
        hero.currentHp = nextHp;
        await supabase
          .from('rpg_heroes')
          .update({ current_hp: nextHp, updated_at: new Date().toISOString() })
          .eq('id', hero.id);
      }
    }
  }

  const allEnemiesDead = encounter.enemies.every((e) => e.currentHp <= 0);
  const allHeroesDead = equipped.every((h) => h.currentHp <= 0);

  let nextQuestion: ReturnType<typeof toSafeClientQuestion> | null = null;

  if (allEnemiesDead) {
    encounter.status = 'victory';
    encounter.phase = 'hero_turn';
    encounter.attackingEnemyId = null;
    encounter.turnTimeLimitSec = null;
    encounter.turnStartedAt = null;

    const baseXp = isSpecial
      ? RPG_BALANCE.xp.rewards.specialCorrect
      : RPG_BALANCE.xp.rewards.questionCorrect;
    xpAwarded = scaleXpByRegion(baseXp, campaign.currentRegionIndex);
    goldAwarded = isSpecial ? 30 : 15;

    await awardXpToEquippedHeroes(supabase, equipped, xpAwarded);
    await supabase
      .from('rpg_campaigns')
      .update({ gold: campaign.gold + goldAwarded, updated_at: new Date().toISOString() })
      .eq('id', campaign.id);

    const nextCompleted = Array.from(new Set([...currentMap.completedNodeIds, node.id]));
    await supabase
      .from('rpg_region_maps')
      .update({ completed_node_ids: nextCompleted, updated_at: new Date().toISOString() })
      .eq('id', currentMap.id);
  } else if (allHeroesDead) {
    encounter.status = 'defeat';
    encounter.phase = 'hero_turn';
    encounter.attackingEnemyId = null;
    encounter.turnTimeLimitSec = null;
    encounter.turnStartedAt = null;

    for (const hero of equipped) {
      const recovered = Math.max(10, Math.round(hero.maxHp * RPG_BALANCE.combat.defeatRecoveryHpRatio));
      await supabase
        .from('rpg_heroes')
        .update({ current_hp: recovered, updated_at: new Date().toISOString() })
        .eq('id', hero.id);
    }
    const lastCheckpoint = [...currentMap.graph.nodes]
      .reverse()
      .find((n) => n.type === 'checkpoint' && currentMap.completedNodeIds.includes(n.id));
    await supabase
      .from('rpg_campaigns')
      .update({
        current_node_id: lastCheckpoint?.id ?? currentMap.graph.startNodeId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', campaign.id);
  } else {
    encounter.turnNumber += 1;
    const nextCode = pickNextStageQuestionCode(
      campaign.currentRegionIndex,
      encounter.usedQuestionCodes
    );
    encounter.currentQuestionCodigo = nextCode;
    encounter.usedQuestionCodes.push(nextCode);
    nextQuestion = toSafeClientQuestion(nextCode);

    // Alterna para TURNO DE ATAQUE DO INIMIGO após o herói agir!
    const alive = encounter.enemies.filter((e) => e.currentHp > 0);
    if (!wasEnemyTurn && alive.length > 0) {
      const attacker = alive[(encounter.turnNumber - 1) % alive.length];
      encounter.phase = 'enemy_turn';
      encounter.attackingEnemyId = attacker.id;
      encounter.turnTimeLimitSec = getEnemyTurnTimeLimitSec(
        campaign.currentRegionIndex,
        isSpecial,
        node.level
      );
      encounter.turnStartedAt = new Date().toISOString();
    } else {
      encounter.phase = 'hero_turn';
      encounter.attackingEnemyId = null;
      encounter.turnTimeLimitSec = null;
      encounter.turnStartedAt = null;
    }
  }

  if (existing) {
    await supabase
      .from('rpg_node_resolutions')
      .update({
        question_codigo: encounter.currentQuestionCodigo,
        outcome_json: { isCorrect: encounter.status === 'victory', encounter },
        xp_awarded: xpAwarded,
        rewards_json: { gold: goldAwarded, chestClaimed: false },
      })
      .eq('id', existing.id);
  } else {
    await supabase.from('rpg_node_resolutions').insert({
      campaign_id: campaign.id,
      user_id: userId,
      region_index: campaign.currentRegionIndex,
      node_id: node.id,
      node_type: node.type,
      question_codigo: encounter.currentQuestionCodigo,
      outcome_json: { isCorrect: encounter.status === 'victory', encounter },
      xp_awarded: xpAwarded,
      rewards_json: { gold: goldAwarded, chestClaimed: false },
    });
  }

  const updatedSnap = await getOrCreateCampaignSnapshot(supabase, userId);

  return {
    isCorrect: evalRes.isCorrect,
    wasEnemyTurn,
    attackBlocked,
    timedOut: effectiveTimedOut,
    correctAnswers: evalRes.normalizedCorrect,
    explanation: question.explicacao,
    damageDealt,
    isCritical,
    targetEnemyName,
    parriedByHeroName,
    xpAwarded,
    hpPenalty,
    goldAwarded,
    alreadyResolved: false,
    encounterStatus: encounter.status,
    encounter,
    nextQuestion,
    rewardChestAvailable: encounter.status === 'victory',
    rewardChestStyle: isSpecial ? 'gold' : 'wood',
    snapshot: updatedSnap,
  };
}

/**
 * Abre 1 dos 3 baús de prêmio oferecidos imediatamente após vencer uma fase.
 * Operação 100% validada no servidor e idempotente por `nodeId`.
 */
export async function claimRpgRewardChest(
  supabase: SupabaseClient,
  userId: string,
  nodeId: string,
  chestIndex: number
): Promise<{
  chestIndex: number;
  chestStyle: 'wood' | 'gold';
  itemId: string;
  itemName: string;
  itemRarity: RpgRarity;
  itemDescription: string;
  bonusGold: number;
  bonusHints: number;
  snapshot: RpgCampaignSnapshot;
}> {
  const snapshot = await getOrCreateCampaignSnapshot(supabase, userId);
  const { campaign } = snapshot;

  const { data: resolution } = await supabase
    .from('rpg_node_resolutions')
    .select('*')
    .eq('campaign_id', campaign.id)
    .eq('region_index', campaign.currentRegionIndex)
    .eq('node_id', nodeId)
    .maybeSingle();

  if (!resolution) {
    throw new Error('Conclua a fase antes de abrir o baú de recompensa.');
  }

  const outcome = (resolution.outcome_json ?? {}) as { isCorrect?: boolean };
  if (!outcome.isCorrect) {
    throw new Error('Apenas vitórias na fase concedem baú de recompensa.');
  }

  const prevRewards = (resolution.rewards_json ?? {}) as {
    chestClaimed?: boolean;
    claimedReward?: {
      chestIndex: number;
      chestStyle: 'wood' | 'gold';
      itemId: string;
      itemName: string;
      itemRarity: RpgRarity;
      itemDescription: string;
      bonusGold: number;
      bonusHints: number;
    };
  };

  if (prevRewards.chestClaimed && prevRewards.claimedReward) {
    return { ...prevRewards.claimedReward, snapshot };
  }

  const isElite = resolution.node_type === 'special';
  const chestStyle: 'wood' | 'gold' = isElite ? 'gold' : 'wood';

  // Pool ponderado de drops reais (conforme raridade da fase)
  const elitePool = [
    'prism-elimination-rare',
    'elixir-restoration',
    'blade-clarity',
    'shield-traceability',
    'staff-ears',
    'cloak-stakeholder',
    'tome-syllabus',
    'tonic-fury',
  ];
  const normalPool = [
    'potion-minor-heal',
    'lens-elimination-common',
    'scroll-insight',
    'tonic-fury',
    'ward-parry',
    'prism-elimination-rare',
    'blade-clarity',
  ];

  const pool = isElite ? elitePool : normalPool;
  const chosenId = pool[Math.floor(Math.random() * pool.length)] ?? 'potion-minor-heal';
  const itemDef = getItemDefinition(chosenId) ?? getItemDefinition('potion-minor-heal')!;

  const bonusGold = isElite ? 20 + campaign.currentRegionIndex * 10 : 10 + campaign.currentRegionIndex * 5;
  const bonusHints = isElite && Math.random() < 0.45 ? 1 : 0;

  await grantInventoryItem(supabase, userId, campaign.id, itemDef.id, 1);

  await supabase
    .from('rpg_campaigns')
    .update({
      gold: campaign.gold + bonusGold,
      hints_remaining: Math.min(campaign.hintsMax + 4, campaign.hintsRemaining + bonusHints),
      updated_at: new Date().toISOString(),
    })
    .eq('id', campaign.id);

  const claimedReward = {
    chestIndex,
    chestStyle,
    itemId: itemDef.id,
    itemName: itemDef.name,
    itemRarity: itemDef.rarity,
    itemDescription: itemDef.description,
    bonusGold,
    bonusHints,
  };

  await supabase
    .from('rpg_node_resolutions')
    .update({
      rewards_json: { ...prevRewards, chestClaimed: true, claimedReward },
    })
    .eq('id', resolution.id);

  const updatedSnap = await getOrCreateCampaignSnapshot(supabase, userId);
  return { ...claimedReward, snapshot: updatedSnap };
}

export async function consumeRpgHint(
  supabase: SupabaseClient,
  userId: string,
  params: { questionCodigo?: string; bossQuestionText?: string; topicId?: string }
): Promise<{
  hint: string;
  hintsRemaining: number;
  sources: Array<{ id: string; eu: string; title: string }>;
  snapshot: RpgCampaignSnapshot;
}> {
  const snapshot = await getOrCreateCampaignSnapshot(supabase, userId);
  const { campaign } = snapshot;

  const consumed = consumePartyHint(campaign.hintsRemaining);
  if (!consumed.allowed) {
    throw new Error('Sem dicas disponíveis no grupo! Descanse em um Checkpoint ou use um Pergaminho de Insight.');
  }

  let questionText = params.bossQuestionText ?? '';
  let topicId = params.topicId ?? null;
  let internalAnswerBlock = '';

  if (params.questionCodigo) {
    const q = loadStaticSourceQuestions().find((item) => item.codigo === params.questionCodigo);
    if (q) {
      questionText = `${q.enunciado}\nAlternativas:\n${Object.entries(q.alternativas)
        .map(([k, v]) => `${k}) ${v}`)
        .join('\n')}`;
      internalAnswerBlock = `Gabarito (USO INTERNO — PROIBIDO REVELAR): ${JSON.stringify(q.resposta_correta)}`;
    }
  }

  const retrieved = await retrieveOfficialIrebKnowledge({
    supabase,
    topicId,
    questionText,
    maxChunks: 2,
  });

  let hintText =
    'Foque nos termos oficiais do Syllabus IREB CPRE-FL presentes no enunciado, distinguindo requisitos de soluções técnicas e verificando a responsabilidade de cada papel.';

  if (isAnyFreeAIConfigured()) {
    try {
      const aiRes = await generateWithFreeCascade({
        systemInstruction: [
          'Você é o Conselheiro Arcano de um RPG educacional focado em IREB CPRE-FL.',
          'Forneça UMA dica estratégica concisa (2 a 3 frases) que oriente o raciocínio conceitual sem NUNCA entregar a letra correta nem escrever a resposta pronta.',
          retrieved.promptBlock,
        ].join('\n'),
        messages: [
          {
            role: 'user',
            text: `${questionText}\n${internalAnswerBlock}\nDê uma dica objetiva sem revelar a resposta.`,
          },
        ],
        temperature: 0.4,
        maxOutputTokens: 220,
      });
      hintText = aiRes.text;
    } catch {
      // mantém fallback conceitual
    }
  }

  await supabase
    .from('rpg_campaigns')
    .update({
      hints_remaining: consumed.nextHintsRemaining,
      updated_at: new Date().toISOString(),
    })
    .eq('id', campaign.id);

  const updatedSnap = await getOrCreateCampaignSnapshot(supabase, userId);

  return {
    hint: hintText,
    hintsRemaining: consumed.nextHintsRemaining,
    sources: retrieved.sources,
    snapshot: updatedSnap,
  };
}

export async function useRpgEliminationItem(
  supabase: SupabaseClient,
  userId: string,
  params: { itemId: string; questionCodigo: string; alreadyEliminated?: string[] }
): Promise<{
  newlyEliminated: string[];
  allEliminated: string[];
  snapshot: RpgCampaignSnapshot;
}> {
  const snapshot = await getOrCreateCampaignSnapshot(supabase, userId);
  const itemDef = getItemDefinition(params.itemId);
  if (!itemDef || itemDef.category !== 'eliminate_option' || !itemDef.effects.eliminateWrongCount) {
    throw new Error('Item inválido para eliminação de alternativas.');
  }

  const invEntry = snapshot.inventory.find(
    (i) => i.itemId === params.itemId && i.equippedByHeroId === null && i.quantity > 0
  );
  if (!invEntry) {
    throw new Error(`Você não possui ${itemDef.name} disponível no inventário.`);
  }

  const question = loadStaticSourceQuestions().find((q) => q.codigo === params.questionCodigo);
  if (!question) {
    throw new Error('Questão não encontrada.');
  }

  const result = eliminateWrongOptions({
    alternativas: question.alternativas,
    respostaCorreta: question.resposta_correta,
    alreadyEliminated: params.alreadyEliminated,
    count: itemDef.effects.eliminateWrongCount,
  });

  if (result.newlyEliminated.length === 0) {
    throw new Error('Não há mais alternativas incorretas disponíveis para eliminar.');
  }

  await supabase
    .from('rpg_inventory_items')
    .update({ quantity: invEntry.quantity - 1, updated_at: new Date().toISOString() })
    .eq('id', invEntry.id);

  const updatedSnap = await getOrCreateCampaignSnapshot(supabase, userId);
  return { ...result, snapshot: updatedSnap };
}

export async function resolveRpgEventNode(
  supabase: SupabaseClient,
  userId: string,
  nodeId: string,
  choiceId: string
): Promise<{
  narrative: string;
  alreadyResolved: boolean;
  snapshot: RpgCampaignSnapshot;
}> {
  const snapshot = await getOrCreateCampaignSnapshot(supabase, userId);
  const { campaign, currentMap, heroes } = snapshot;

  const node = currentMap.graph.nodes.find((n) => n.id === nodeId);
  if (!node || (node.type !== 'event' && node.type !== 'gap')) {
    throw new Error('Nó de evento inválido.');
  }

  const { data: existing } = await supabase
    .from('rpg_node_resolutions')
    .select('outcome_json')
    .eq('campaign_id', campaign.id)
    .eq('region_index', campaign.currentRegionIndex)
    .eq('node_id', node.id)
    .maybeSingle();

  if (existing) {
    return {
      narrative: String((existing.outcome_json as { narrative?: string }).narrative ?? 'Evento já concluído.'),
      alreadyResolved: true,
      snapshot,
    };
  }

  const eventDef = getEventById(node.eventId ?? '');
  const choice = eventDef.choices.find((c) => c.id === choiceId) ?? eventDef.choices[0];
  const out = choice.outcome;

  const equipped = heroes.filter((h) => h.isEquipped);
  const xpAwarded = out.xpDelta ? scaleXpByRegion(out.xpDelta, campaign.currentRegionIndex) : 0;

  if (xpAwarded > 0) {
    await awardXpToEquippedHeroes(supabase, equipped, xpAwarded);
  }

  if (out.hpDelta && out.hpDelta !== 0) {
    for (const hero of equipped) {
      const nextHp = Math.max(1, Math.min(hero.maxHp, hero.currentHp + out.hpDelta));
      await supabase
        .from('rpg_heroes')
        .update({ current_hp: nextHp, updated_at: new Date().toISOString() })
        .eq('id', hero.id);
    }
  }

  if (out.grantItemId) {
    await grantInventoryItem(supabase, userId, campaign.id, out.grantItemId, 1);
  }

  const nextEffects = [...campaign.activeEffects];
  if (out.tempDamageBonus) {
    nextEffects.push({
      id: `eff-${Date.now()}`,
      label: `Foco Tático (+${out.tempDamageBonus} Dano)`,
      bonusDamage: out.tempDamageBonus,
      remainingTurns: 2,
    });
  }
  if (out.tempParryBonus) {
    nextEffects.push({
      id: `eff-${Date.now() + 1}`,
      label: `Postura Defensiva (+${Math.round(out.tempParryBonus * 100)}% Parry)`,
      bonusParryChance: out.tempParryBonus,
      remainingTurns: 2,
    });
  }

  const nextHints = Math.max(
    0,
    Math.min(campaign.hintsMax + 4, campaign.hintsRemaining + (out.hintsDelta ?? 0))
  );
  const nextGold = Math.max(0, campaign.gold + (out.goldDelta ?? 0));

  await supabase
    .from('rpg_campaigns')
    .update({
      hints_remaining: nextHints,
      gold: nextGold,
      active_effects_json: nextEffects,
      updated_at: new Date().toISOString(),
    })
    .eq('id', campaign.id);

  await supabase.from('rpg_node_resolutions').insert({
    campaign_id: campaign.id,
    user_id: userId,
    region_index: campaign.currentRegionIndex,
    node_id: node.id,
    node_type: node.type,
    outcome_json: { choiceId: choice.id, narrative: out.narrative },
    xp_awarded: xpAwarded,
    rewards_json: out,
  });

  const nextCompleted = Array.from(new Set([...currentMap.completedNodeIds, node.id]));
  await supabase
    .from('rpg_region_maps')
    .update({ completed_node_ids: nextCompleted, updated_at: new Date().toISOString() })
    .eq('id', currentMap.id);

  const updatedSnap = await getOrCreateCampaignSnapshot(supabase, userId);
  return { narrative: out.narrative, alreadyResolved: false, snapshot: updatedSnap };
}

export async function performRpgCheckpointAction(
  supabase: SupabaseClient,
  userId: string,
  payload:
    | { action: 'rest' }
    | { action: 'equip_heroes'; heroIds: string[] }
    | { action: 'spend_stat_point'; heroId: string; stat: RpgStatKey }
): Promise<{ message: string; snapshot: RpgCampaignSnapshot }> {
  const snapshot = await getOrCreateCampaignSnapshot(supabase, userId);
  const { campaign, currentMap, heroes } = snapshot;

  const currentNode = currentMap.graph.nodes.find((n) => n.id === campaign.currentNodeId);
  const isAtCheckpoint = currentNode?.type === 'checkpoint';

  if (payload.action === 'equip_heroes') {
    const check = validateHeroEquipChange({
      isAtCheckpoint,
      allHeroes: heroes,
      requestedHeroIds: payload.heroIds,
    });
    if (!check.valid) {
      throw new Error(check.reason);
    }

    const selectedSet = new Set(payload.heroIds);
    let slot = 1;
    for (const hero of heroes) {
      const willEquip = selectedSet.has(hero.id);
      await supabase
        .from('rpg_heroes')
        .update({
          is_equipped: willEquip,
          slot_index: willEquip ? slot++ : null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', hero.id);
    }

    const updatedEquipped = heroes.filter((h) => selectedSet.has(h.id));
    const nextHintsMax = computePartyHintsMax(updatedEquipped);
    const nextHintsRemaining = Math.min(nextHintsMax, Math.max(campaign.hintsRemaining, nextHintsMax - 1));

    await supabase
      .from('rpg_campaigns')
      .update({
        hints_max: nextHintsMax,
        hints_remaining: nextHintsRemaining,
        updated_at: new Date().toISOString(),
      })
      .eq('id', campaign.id);

    const updatedSnap = await getOrCreateCampaignSnapshot(supabase, userId);
    return { message: 'Formação do grupo atualizada com sucesso!', snapshot: updatedSnap };
  }

  if (payload.action === 'spend_stat_point') {
    const hero = heroes.find((h) => h.id === payload.heroId);
    if (!hero) throw new Error('Herói não encontrado.');
    const evolved = spendHeroStatPoint(hero, payload.stat);

    await supabase
      .from('rpg_heroes')
      .update({
        unspent_stat_points: evolved.unspentStatPoints,
        max_hp: evolved.maxHp,
        current_hp: evolved.currentHp,
        intelligence: evolved.intelligence,
        base_damage: evolved.baseDamage,
        parry_chance: evolved.parryChance,
        crit_chance: evolved.critChance,
        updated_at: new Date().toISOString(),
      })
      .eq('id', hero.id);

    if (payload.stat === 'intelligence' && hero.isEquipped) {
      const nextMax = campaign.hintsMax + RPG_BALANCE.levelUp.increments.intelligence;
      await supabase
        .from('rpg_campaigns')
        .update({
          hints_max: nextMax,
          hints_remaining: campaign.hintsRemaining + RPG_BALANCE.levelUp.increments.intelligence,
          updated_at: new Date().toISOString(),
        })
        .eq('id', campaign.id);
    }

    const updatedSnap = await getOrCreateCampaignSnapshot(supabase, userId);
    return { message: `Atributo de ${hero.name} aprimorado!`, snapshot: updatedSnap };
  }

  // action === 'rest'
  if (!isAtCheckpoint) {
    throw new Error('O descanso completo só pode ser realizado em um Checkpoint.');
  }

  const equipped = heroes.filter((h) => h.isEquipped);
  for (const hero of equipped) {
    await supabase
      .from('rpg_heroes')
      .update({ current_hp: hero.maxHp, updated_at: new Date().toISOString() })
      .eq('id', hero.id);
  }

  const missingHints = Math.max(0, campaign.hintsMax - campaign.hintsRemaining);
  const restoredHints = Math.max(
    RPG_BALANCE.combat.checkpointHintRestoreMin,
    Math.ceil(missingHints * RPG_BALANCE.combat.checkpointHintRestoreRatio)
  );
  const nextHints = Math.min(campaign.hintsMax, campaign.hintsRemaining + restoredHints);

  await supabase
    .from('rpg_campaigns')
    .update({ hints_remaining: nextHints, updated_at: new Date().toISOString() })
    .eq('id', campaign.id);

  const updatedSnap = await getOrCreateCampaignSnapshot(supabase, userId);
  return {
    message: 'Grupo totalmente curado e dicas restauradas no Checkpoint!',
    snapshot: updatedSnap,
  };
}

export async function handleRpgInventoryAction(
  supabase: SupabaseClient,
  userId: string,
  params: {
    itemId: string;
    action: 'use' | 'equip' | 'unequip';
    heroId?: string;
  }
): Promise<{ message: string; snapshot: RpgCampaignSnapshot }> {
  const snapshot = await getOrCreateCampaignSnapshot(supabase, userId);
  const { campaign, heroes, inventory } = snapshot;
  const itemDef = getItemDefinition(params.itemId);
  if (!itemDef) throw new Error('Item desconhecido.');

  if (params.action === 'use') {
    if (itemDef.usageType !== 'consumable') {
      throw new Error('Este item é um equipamento, não um consumível.');
    }
    const entry = inventory.find((i) => i.itemId === params.itemId && !i.equippedByHeroId && i.quantity > 0);
    if (!entry) throw new Error('Item indisponível no inventário.');

    const equipped = heroes.filter((h) => h.isEquipped);
    if (itemDef.effects.healHp) {
      for (const hero of equipped) {
        const nextHp = Math.min(hero.maxHp, hero.currentHp + itemDef.effects.healHp);
        await supabase
          .from('rpg_heroes')
          .update({ current_hp: nextHp, updated_at: new Date().toISOString() })
          .eq('id', hero.id);
      }
    }

    let nextHints = campaign.hintsRemaining;
    if (itemDef.effects.restoreHints) {
      nextHints = Math.min(campaign.hintsMax + 4, campaign.hintsRemaining + itemDef.effects.restoreHints);
    }

    const nextEffects = [...campaign.activeEffects];
    if (itemDef.effects.durationTurns && (itemDef.effects.bonusDamage || itemDef.effects.bonusParryChance)) {
      nextEffects.push({
        id: `item-${Date.now()}`,
        label: itemDef.name,
        bonusDamage: itemDef.effects.bonusDamage,
        bonusParryChance: itemDef.effects.bonusParryChance,
        remainingTurns: itemDef.effects.durationTurns,
      });
    }

    await supabase
      .from('rpg_campaigns')
      .update({
        hints_remaining: nextHints,
        active_effects_json: nextEffects,
        updated_at: new Date().toISOString(),
      })
      .eq('id', campaign.id);

    await supabase
      .from('rpg_inventory_items')
      .update({ quantity: entry.quantity - 1, updated_at: new Date().toISOString() })
      .eq('id', entry.id);

    const updatedSnap = await getOrCreateCampaignSnapshot(supabase, userId);
    return { message: `${itemDef.name} utilizado com sucesso!`, snapshot: updatedSnap };
  }

  // Equip / Unequip
  const hero = heroes.find((h) => h.id === params.heroId);
  if (!hero || !hero.isUnlocked) throw new Error('Selecione um herói desbloqueado válido.');

  if (params.action === 'equip') {
    if (itemDef.usageType !== 'equipment') throw new Error('Apenas equipamentos podem ser equipados.');
    if (itemDef.compatibleClasses && !itemDef.compatibleClasses.includes(hero.heroClassId)) {
      throw new Error(`${itemDef.name} não é compatível com a classe de ${hero.name}.`);
    }
    const entry = inventory.find((i) => i.itemId === params.itemId && !i.equippedByHeroId && i.quantity > 0);
    if (!entry) throw new Error('Item não disponível na mochila.');
    if (hero.equippedItemIds.includes(params.itemId)) {
      throw new Error(`${hero.name} já está com ${itemDef.name} equipado.`);
    }

    const nextEquippedIds = [...hero.equippedItemIds, params.itemId];
    await supabase
      .from('rpg_heroes')
      .update({ equipped_item_ids: nextEquippedIds, updated_at: new Date().toISOString() })
      .eq('id', hero.id);

    await supabase
      .from('rpg_inventory_items')
      .update({ quantity: entry.quantity - 1, updated_at: new Date().toISOString() })
      .eq('id', entry.id);

    const updatedSnap = await getOrCreateCampaignSnapshot(supabase, userId);
    return { message: `${itemDef.name} equipado em ${hero.name}!`, snapshot: updatedSnap };
  }

  // Unequip
  if (!hero.equippedItemIds.includes(params.itemId)) {
    throw new Error(`${hero.name} não está equipando este item.`);
  }
  const nextEquippedIds = hero.equippedItemIds.filter((id) => id !== params.itemId);
  await supabase
    .from('rpg_heroes')
    .update({ equipped_item_ids: nextEquippedIds, updated_at: new Date().toISOString() })
    .eq('id', hero.id);

  await grantInventoryItem(supabase, userId, campaign.id, params.itemId, 1);

  const updatedSnap = await getOrCreateCampaignSnapshot(supabase, userId);
  return { message: `${itemDef.name} devolvido à mochila.`, snapshot: updatedSnap };
}

export async function submitRpgBossTurn(
  supabase: SupabaseClient,
  userId: string,
  battleId: string,
  playerAnswer: string
): Promise<{
  turn: RpgBossTurnRecord;
  battleStatus: 'in_progress' | 'victory' | 'defeat';
  bossCurrentHp: number;
  unlockedHeroName: string | null;
  unlockedNextRegionName: string | null;
  xpAwarded: number;
  snapshot: RpgCampaignSnapshot;
}> {
  const snapshot = await getOrCreateCampaignSnapshot(supabase, userId);
  const { campaign, currentMap, heroes, activeBossBattle } = snapshot;

  if (!activeBossBattle || activeBossBattle.id !== battleId || activeBossBattle.status !== 'in_progress') {
    throw new Error('Combate contra chefe não está ativo.');
  }

  const bossDef = getBossById(activeBossBattle.bossId);
  const prompt = activeBossBattle.currentPrompt;
  const equipped = heroes.filter((h) => h.isEquipped);
  const partyStats = computeEffectivePartyStats(equipped, campaign.activeEffects);

  // 1. Avalia resposta discursiva via IA + RAG oficial IREB (com fallback seguro)
  const evaluation = await evaluateBossDiscursiveAnswer({
    supabase,
    prompt,
    playerAnswer,
  });

  // 2. Calcula dano causado ao chefe
  const { damage: damageDealt, isCritical } = calculateBossDamage({
    score: evaluation.score,
    classification: evaluation.classification,
    partyStats,
  });

  const nextBossHp = Math.max(0, activeBossBattle.bossCurrentHp - damageDealt);

  // 3. Se chefe ainda vivo e resposta foi incorreta (ou sem dano), chefe contra-ataca
  let bossDamageDealt = 0;
  let parriedByHeroId: string | null = null;
  let parriedByHeroName: string | null = null;

  if (nextBossHp > 0 && evaluation.classification === 'incorrect') {
    const counter = calculateBossCounterAttack({
      bossAttackDamage: bossDef.attackDamage,
      equippedHeroes: equipped,
      activeEffects: campaign.activeEffects,
    });

    if (counter.parried) {
      parriedByHeroId = counter.parriedByHeroId;
      parriedByHeroName = counter.parriedByHeroName;
    } else {
      bossDamageDealt = counter.damageTakenPerHero;
      for (const hero of equipped) {
        const nextHp = Math.max(0, hero.currentHp - bossDamageDealt);
        hero.currentHp = nextHp;
        await supabase
          .from('rpg_heroes')
          .update({ current_hp: nextHp, updated_at: new Date().toISOString() })
          .eq('id', hero.id);
      }
    }
  }

  // Decrementa turnos de efeitos temporários
  const nextEffects = campaign.activeEffects
    .map((e) => ({ ...e, remainingTurns: e.remainingTurns - 1 }))
    .filter((e) => e.remainingTurns > 0);

  // Registra turno no banco
  const { data: turnRow } = await supabase
    .from('rpg_boss_turns')
    .insert({
      battle_id: battleId,
      user_id: userId,
      turn_number: activeBossBattle.turnNumber,
      prompt_id: prompt.id,
      prompt_question: prompt.question,
      player_answer: playerAnswer,
      evaluation_json: evaluation,
      damage_dealt: damageDealt,
      is_critical: isCritical,
      boss_damage_dealt: bossDamageDealt,
      parried_by_hero_id: parriedByHeroId,
      parried_by_hero_name: parriedByHeroName,
    })
    .select('*')
    .single();

  const partyDefeated = equipped.every((h) => h.currentHp <= 0);
  let battleStatus: 'in_progress' | 'victory' | 'defeat' = 'in_progress';
  let unlockedHeroName: string | null = null;
  let unlockedNextRegionName: string | null = null;
  let xpAwarded = 0;

  if (nextBossHp <= 0) {
    battleStatus = 'victory';
    await supabase
      .from('rpg_boss_battles')
      .update({
        status: 'victory',
        boss_current_hp: 0,
        finished_at: new Date().toISOString(),
      })
      .eq('id', battleId);

    // Concede recompensas de forma idempotente (somente na primeira vitória contra esse chefe)
    const { data: prevWin } = await supabase
      .from('rpg_node_resolutions')
      .select('id')
      .eq('campaign_id', campaign.id)
      .eq('region_index', campaign.currentRegionIndex)
      .eq('node_id', currentMap.graph.bossNodeId)
      .maybeSingle();

    if (!prevWin) {
      xpAwarded = bossDef.xpReward + RPG_BALANCE.xp.rewards.regionCompletionBonus;
      await awardXpToEquippedHeroes(supabase, equipped, xpAwarded);
      await grantInventoryItem(supabase, userId, campaign.id, bossDef.guaranteedItemId, 1);

      const regionCfg = getRegionByIndex(campaign.currentRegionIndex);
      if (regionCfg.unlockHeroClassId) {
        const toUnlock = heroes.find((h) => h.heroClassId === regionCfg.unlockHeroClassId);
        if (toUnlock && !toUnlock.isUnlocked) {
          await supabase
            .from('rpg_heroes')
            .update({ is_unlocked: true, updated_at: new Date().toISOString() })
            .eq('id', toUnlock.id);
          unlockedHeroName = toUnlock.name;
        }
      }

      const nextRegionIdx = Math.min(RPG_REGIONS.length - 1, campaign.currentRegionIndex + 1);
      const hasNextRegion = campaign.currentRegionIndex + 1 < RPG_REGIONS.length;
      if (hasNextRegion) {
        unlockedNextRegionName = getRegionByIndex(nextRegionIdx).name;
        const nextMapRow = snapshot.regionMaps.find((m) => m.regionIndex === nextRegionIdx);
        if (nextMapRow && nextMapRow.status === 'locked') {
          await supabase
            .from('rpg_region_maps')
            .update({
              status: 'active',
              completed_node_ids: [nextMapRow.graph.startNodeId],
              updated_at: new Date().toISOString(),
            })
            .eq('id', nextMapRow.id);
        }
      }

      const nextCompleted = Array.from(
        new Set([...currentMap.completedNodeIds, currentMap.graph.bossNodeId])
      );
      await supabase
        .from('rpg_region_maps')
        .update({
          completed_node_ids: nextCompleted,
          status: 'completed',
          updated_at: new Date().toISOString(),
        })
        .eq('id', currentMap.id);

      await supabase.from('rpg_node_resolutions').insert({
        campaign_id: campaign.id,
        user_id: userId,
        region_index: campaign.currentRegionIndex,
        node_id: currentMap.graph.bossNodeId,
        node_type: 'boss',
        outcome_json: { victory: true, bossId: bossDef.id },
        xp_awarded: xpAwarded,
        rewards_json: {
          gold: bossDef.goldReward,
          itemId: bossDef.guaranteedItemId,
          unlockedHeroName,
        },
      });

      await supabase
        .from('rpg_campaigns')
        .update({
          gold: campaign.gold + bossDef.goldReward,
          unlocked_region_index: Math.max(campaign.unlockedRegionIndex, nextRegionIdx),
          status: hasNextRegion ? 'active' : 'completed',
          active_effects_json: nextEffects,
          updated_at: new Date().toISOString(),
        })
        .eq('id', campaign.id);
    }
  } else if (partyDefeated) {
    battleStatus = 'defeat';
    await supabase
      .from('rpg_boss_battles')
      .update({
        status: 'defeat',
        boss_current_hp: nextBossHp,
        finished_at: new Date().toISOString(),
      })
      .eq('id', battleId);

    // Política de recuperação: NÃO apaga o progresso — restaura 60% do HP e retorna ao último checkpoint
    for (const hero of equipped) {
      const recoveredHp = Math.max(10, Math.round(hero.maxHp * RPG_BALANCE.combat.defeatRecoveryHpRatio));
      await supabase
        .from('rpg_heroes')
        .update({ current_hp: recoveredHp, updated_at: new Date().toISOString() })
        .eq('id', hero.id);
    }

    const lastCheckpoint = [...currentMap.graph.nodes]
      .reverse()
      .find((n) => n.type === 'checkpoint' && currentMap.completedNodeIds.includes(n.id));

    await supabase
      .from('rpg_campaigns')
      .update({
        current_node_id: lastCheckpoint?.id ?? currentMap.graph.startNodeId,
        active_effects_json: [],
        updated_at: new Date().toISOString(),
      })
      .eq('id', campaign.id);
  } else {
    // Escolhe próxima pergunta discursiva do chefe
    const unused = bossDef.prompts.filter((p) => !activeBossBattle.usedPromptIds.includes(p.id));
    const nextPrompt =
      unused[0] ?? bossDef.prompts[activeBossBattle.turnNumber % bossDef.prompts.length];
    const nextUsed = Array.from(new Set([...activeBossBattle.usedPromptIds, nextPrompt.id]));

    await supabase
      .from('rpg_boss_battles')
      .update({
        boss_current_hp: nextBossHp,
        turn_number: activeBossBattle.turnNumber + 1,
        current_prompt_id: nextPrompt.id,
        used_prompt_ids: nextUsed,
      })
      .eq('id', battleId);

    await supabase
      .from('rpg_campaigns')
      .update({ active_effects_json: nextEffects, updated_at: new Date().toISOString() })
      .eq('id', campaign.id);
  }

  const updatedSnap = await getOrCreateCampaignSnapshot(supabase, userId);

  const turn: RpgBossTurnRecord = {
    id: String(turnRow?.id ?? Date.now()),
    battleId,
    turnNumber: activeBossBattle.turnNumber,
    promptId: prompt.id,
    promptQuestion: prompt.question,
    playerAnswer,
    evaluation,
    damageDealt,
    isCritical,
    bossDamageDealt,
    parriedByHeroId,
    parriedByHeroName,
    createdAt: String(turnRow?.created_at ?? new Date().toISOString()),
  };

  return {
    turn,
    battleStatus,
    bossCurrentHp: nextBossHp,
    unlockedHeroName,
    unlockedNextRegionName,
    xpAwarded,
    snapshot: updatedSnap,
  };
}

export type RpgRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

export type RpgHeroClassId = 'warrior' | 'mage' | 'rogue' | 'paladin';

export type RpgRegionId =
  | 'gruta-esquecida'
  | 'caverna-assombrada'
  | 'caverna-de-fogo'
  | 'dungeon-de-gelo';

export type RpgNodeType =
  | 'start'
  | 'question'
  | 'event'
  | 'gap'
  | 'chest'
  | 'checkpoint'
  | 'special'
  | 'boss';

export type RpgNodeStatus = 'locked' | 'available' | 'current' | 'completed';

export type RpgItemCategory =
  | 'potion'
  | 'heal'
  | 'extra_hp'
  | 'hint'
  | 'damage'
  | 'defense'
  | 'parry'
  | 'crit'
  | 'eliminate_option';

export type RpgItemUsageType = 'consumable' | 'equipment';

export type RpgStatKey =
  | 'maxHp'
  | 'intelligence'
  | 'baseDamage'
  | 'parryChance'
  | 'critChance';

export interface RpgRegionConfig {
  index: number; // 0..3
  id: RpgRegionId;
  name: string;
  subtitle: string;
  levelRange: [number, number];
  bossId: string;
  bossName: string;
  topicIds: string[];
  theme: {
    primary: string;
    accent: string;
    bgFrom: string;
    bgVia: string;
    bgTo: string;
    particleType: 'dust' | 'mist' | 'embers' | 'snow';
    ambientTint: string;
  };
  unlockHeroClassId?: RpgHeroClassId;
  description: string;
}

export interface RpgMapNode {
  id: string;
  level: number; // 1..10 dentro da região (global = regionIndex*10 + level)
  globalLevel: number;
  column: number; // 0..9 para layout horizontal/vertical
  lane: number; // 0 (topo), 1 (centro), 2 (baixo)
  type: RpgNodeType;
  label: string;
  nextIds: string[];
  prevIds: string[];
  questionCodigo?: string;
  eventId?: string;
  chestLootTier?: RpgRarity;
  isAlternativePath?: boolean;
  riskLevel?: 'low' | 'medium' | 'high';
}

export interface RpgRegionMapGraph {
  regionIndex: number;
  regionId: RpgRegionId;
  seed: string;
  nodes: RpgMapNode[];
  startNodeId: string;
  bossNodeId: string;
}

export interface RpgHeroClassDefinition {
  id: RpgHeroClassId;
  name: string;
  title: string;
  role: string;
  personality: string;
  description: string;
  unlockedByDefault: boolean;
  unlockRequirementText: string;
  accentColor: string;
  baseStats: {
    maxHp: number;
    intelligence: number; // contribui diretamente para o pool de dicas compartilhadas
    baseDamage: number;
    parryChance: number; // 0..1
    critChance: number; // 0..1
    critMultiplier: number; // ex.: 1.8
  };
  passiveName: string;
  passiveDescription: string;
}

export interface RpgHeroState {
  id: string;
  campaignId: string;
  heroClassId: RpgHeroClassId;
  name: string;
  isUnlocked: boolean;
  isEquipped: boolean;
  slotIndex: number | null; // 1 | 2 | 3 | null
  level: number;
  xp: number;
  xpToNextLevel: number;
  unspentStatPoints: number;
  maxHp: number;
  currentHp: number;
  intelligence: number;
  baseDamage: number;
  parryChance: number;
  critChance: number;
  critMultiplier: number;
  equippedItemIds: string[];
}

export interface RpgItemDefinition {
  id: string;
  name: string;
  description: string;
  category: RpgItemCategory;
  usageType: RpgItemUsageType;
  rarity: RpgRarity;
  maxStack: number;
  compatibleClasses?: RpgHeroClassId[]; // omitido = todas as classes
  effects: {
    healHp?: number;
    healAllParty?: boolean;
    bonusMaxHp?: number;
    restoreHints?: number;
    bonusDamage?: number;
    bonusDefense?: number;
    bonusParryChance?: number;
    bonusCritChance?: number;
    bonusCritMultiplier?: number;
    eliminateWrongCount?: 1 | 2;
    durationTurns?: number;
  };
}

export interface RpgInventoryEntry {
  id: string;
  campaignId: string;
  itemId: string;
  quantity: number;
  equippedByHeroId: string | null;
}

export interface RpgBossPrompt {
  id: string;
  question: string;
  topicId: string;
  expectedAnswer: string;
  requiredConcepts: string[];
  complementaryConcepts: string[];
  evaluationCriteria: string;
}

export interface RpgBossDefinition {
  id: string;
  regionId: RpgRegionId;
  regionIndex: number;
  name: string;
  title: string;
  personality: string;
  description: string;
  maxHp: number;
  attackDamage: number;
  xpReward: number;
  goldReward: number;
  guaranteedItemId: string;
  accentColor: string;
  introLine: string;
  tauntLines: string[];
  hitLines: string[];
  defeatLine: string;
  prompts: RpgBossPrompt[];
}

export interface RpgBossEvaluation {
  classification: 'correct' | 'partial' | 'incorrect';
  score: number; // 0..1
  identifiedConcepts: string[];
  missingConcepts: string[];
  feedback: string;
  providerLabel: string;
  knowledgeSources: Array<{ id: string; eu: string; title: string }>;
}

export interface RpgBossTurnRecord {
  id: string;
  battleId: string;
  turnNumber: number;
  promptId: string;
  promptQuestion: string;
  playerAnswer: string;
  evaluation: RpgBossEvaluation;
  damageDealt: number;
  isCritical: boolean;
  bossDamageDealt: number;
  parriedByHeroId: string | null;
  parriedByHeroName: string | null;
  createdAt: string;
}

export interface RpgBossBattleState {
  id: string;
  campaignId: string;
  regionIndex: number;
  bossId: string;
  status: 'in_progress' | 'victory' | 'defeat';
  bossMaxHp: number;
  bossCurrentHp: number;
  turnNumber: number;
  currentPrompt: RpgBossPrompt;
  usedPromptIds: string[];
  turns: RpgBossTurnRecord[];
}

export interface RpgEventChoice {
  id: string;
  label: string;
  description: string;
  riskTag: 'safe' | 'balanced' | 'risky';
  outcome: {
    narrative: string;
    xpDelta?: number;
    hpDelta?: number;
    hintsDelta?: number;
    goldDelta?: number;
    grantItemId?: string;
    tempDamageBonus?: number;
    tempParryBonus?: number;
  };
}

export interface RpgEventDefinition {
  id: string;
  kind: 'event' | 'gap';
  title: string;
  description: string;
  regionIds?: RpgRegionId[]; // vazio = qualquer região
  speakerName: string;
  speakerRole: string;
  choices: RpgEventChoice[];
}

export interface RpgDialogueLine {
  speakerName: string;
  speakerRole: string;
  portraitId: string;
  mood?: 'neutral' | 'serious' | 'happy' | 'warning' | 'boss';
  text: string;
}

export interface RpgDialogueScene {
  id: string;
  title: string;
  regionId: RpgRegionId;
  lines: RpgDialogueLine[];
}

export interface RpgActiveTempEffect {
  id: string;
  label: string;
  bonusDamage?: number;
  bonusDefense?: number;
  bonusParryChance?: number;
  bonusCritChance?: number;
  remainingTurns: number;
}

export interface RpgStageEnemy {
  id: string;
  name: string;
  sprite: string;
  isElite: boolean;
  maxHp: number;
  currentHp: number;
  attackDamage: number;
}

export interface RpgStageEncounterState {
  nodeId: string;
  status: 'in_progress' | 'victory' | 'defeat';
  phase: 'hero_turn' | 'enemy_turn';
  attackingEnemyId: string | null;
  turnTimeLimitSec: number | null;
  turnStartedAt: string | null;
  turnNumber: number;
  enemies: RpgStageEnemy[];
  currentQuestionCodigo: string;
  usedQuestionCodes: string[];
}

export interface RpgCampaignState {
  id: string;
  userId: string;
  name: string;
  status: 'active' | 'completed';
  currentRegionIndex: number;
  currentNodeId: string;
  unlockedRegionIndex: number;
  hintsRemaining: number;
  hintsMax: number;
  gold: number;
  seed: string;
  activeEffects: RpgActiveTempEffect[];
  seenDialogueIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface RpgRegionMapState {
  id: string;
  campaignId: string;
  regionIndex: number;
  regionId: RpgRegionId;
  seed: string;
  graph: RpgRegionMapGraph;
  completedNodeIds: string[];
  status: 'locked' | 'active' | 'completed';
}

export interface RpgCampaignSnapshot {
  enabled: boolean;
  campaign: RpgCampaignState;
  regions: RpgRegionConfig[];
  regionMaps: RpgRegionMapState[];
  currentMap: RpgRegionMapState;
  heroes: RpgHeroState[];
  inventory: RpgInventoryEntry[];
  activeBossBattle: RpgBossBattleState | null;
  pendingDialogue: RpgDialogueScene | null;
  stats: {
    totalNodesCompleted: number;
    bossesDefeated: number;
    totalXpEarned: number;
  };
}

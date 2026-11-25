import type { RpgItemDefinition, RpgRarity } from '@/types/rpg';

export const RPG_ITEMS: RpgItemDefinition[] = [
  // Consumíveis de cura
  {
    id: 'potion-minor-heal',
    name: 'Poção de Vitalidade',
    description: 'Restaura 35 pontos de vida para todos os heróis equipados.',
    category: 'potion',
    usageType: 'consumable',
    rarity: 'common',
    maxStack: 10,
    effects: { healHp: 35, healAllParty: true },
  },
  {
    id: 'elixir-restoration',
    name: 'Elixir da Clareza',
    description: 'Restaura 75 pontos de vida para todo o grupo equipado.',
    category: 'heal',
    usageType: 'consumable',
    rarity: 'rare',
    maxStack: 5,
    effects: { healHp: 75, healAllParty: true },
  },

  // Consumíveis de dicas
  {
    id: 'scroll-insight',
    name: 'Pergaminho de Insight',
    description: 'Recupera +2 dicas no reservatório compartilhado do grupo.',
    category: 'hint',
    usageType: 'consumable',
    rarity: 'uncommon',
    maxStack: 8,
    effects: { restoreHints: 2 },
  },
  {
    id: 'tome-syllabus',
    name: 'Tomo do Syllabus v3',
    description: 'Recupera +4 dicas no reservatório compartilhado do grupo.',
    category: 'hint',
    usageType: 'consumable',
    rarity: 'epic',
    maxStack: 3,
    effects: { restoreHints: 4 },
  },

  // Itens de eliminação de alternativas (obrigatórios: Comum = 1, Raro = 2)
  {
    id: 'lens-elimination-common',
    name: 'Lente da Triagem',
    description: 'Elimina 1 alternativa incorreta em uma questão de múltipla escolha. Nunca remove a correta.',
    category: 'eliminate_option',
    usageType: 'consumable',
    rarity: 'common',
    maxStack: 10,
    effects: { eliminateWrongCount: 1 },
  },
  {
    id: 'prism-elimination-rare',
    name: 'Prisma da Precisão',
    description: 'Elimina 2 alternativas incorretas em uma questão de múltipla escolha. Nunca remove a correta.',
    category: 'eliminate_option',
    usageType: 'consumable',
    rarity: 'rare',
    maxStack: 6,
    effects: { eliminateWrongCount: 2 },
  },

  // Consumíveis de combate temporário
  {
    id: 'tonic-fury',
    name: 'Tônico de Foco Tático',
    description: 'Concede +10 de dano-base ao grupo pelos próximos 2 turnos de combate contra chefe.',
    category: 'damage',
    usageType: 'consumable',
    rarity: 'uncommon',
    maxStack: 6,
    effects: { bonusDamage: 10, durationTurns: 2 },
  },
  {
    id: 'ward-parry',
    name: 'Amuleto de Reflexo',
    description: 'Aumenta em +15% a chance de parry pelos próximos 2 turnos de combate.',
    category: 'parry',
    usageType: 'consumable',
    rarity: 'uncommon',
    maxStack: 6,
    effects: { bonusParryChance: 0.15, durationTurns: 2 },
  },

  // Equipamentos permanentes para heróis
  {
    id: 'blade-clarity',
    name: 'Lâmina da Especificação',
    description: 'Equipamento: concede +6 de dano-base ao herói equipado.',
    category: 'damage',
    usageType: 'equipment',
    rarity: 'uncommon',
    maxStack: 3,
    compatibleClasses: ['warrior', 'paladin', 'rogue'],
    effects: { bonusDamage: 6 },
  },
  {
    id: 'shield-traceability',
    name: 'Escudo da Rastreabilidade',
    description: 'Equipamento: concede +25 de vida máxima e +6% de chance de parry.',
    category: 'extra_hp',
    usageType: 'equipment',
    rarity: 'rare',
    maxStack: 2,
    compatibleClasses: ['warrior', 'paladin'],
    effects: { bonusMaxHp: 25, bonusParryChance: 0.06 },
  },
  {
    id: 'staff-ears',
    name: 'Cajado de EARS',
    description: 'Equipamento: concede +5 de dano-base e +10% de chance de crítico.',
    category: 'crit',
    usageType: 'equipment',
    rarity: 'rare',
    maxStack: 2,
    compatibleClasses: ['mage'],
    effects: { bonusDamage: 5, bonusCritChance: 0.1 },
  },
  {
    id: 'cloak-stakeholder',
    name: 'Manto da Elicitação',
    description: 'Equipamento: concede +10% de parry e +8% de chance de crítico.',
    category: 'parry',
    usageType: 'equipment',
    rarity: 'epic',
    maxStack: 2,
    compatibleClasses: ['rogue', 'mage'],
    effects: { bonusParryChance: 0.1, bonusCritChance: 0.08 },
  },
  {
    id: 'crown-baseline',
    name: 'Coroa da Baseline Dourada',
    description: 'Relíquia Lendária: +30 de vida máxima, +8 de dano-base, +8% crítico e +8% parry.',
    category: 'defense',
    usageType: 'equipment',
    rarity: 'legendary',
    maxStack: 1,
    effects: {
      bonusMaxHp: 30,
      bonusDamage: 8,
      bonusCritChance: 0.08,
      bonusParryChance: 0.08,
    },
  },
];

export function getItemDefinition(itemId: string): RpgItemDefinition | undefined {
  return RPG_ITEMS.find((i) => i.id === itemId);
}

export function getItemsByRarity(rarity: RpgRarity): RpgItemDefinition[] {
  return RPG_ITEMS.filter((i) => i.rarity === rarity);
}

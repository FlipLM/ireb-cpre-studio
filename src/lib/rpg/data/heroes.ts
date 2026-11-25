import type { RpgHeroClassDefinition, RpgHeroClassId } from '@/types/rpg';

export const RPG_HERO_CLASSES: RpgHeroClassDefinition[] = [
  {
    id: 'warrior',
    name: 'Aldric, o Guardião',
    title: 'Guerreiro de Requisitos',
    role: 'Linha de Frente',
    personality: 'Pragmático, resiliente e direto ao ponto diante de escopos nebulosos.',
    description:
      'Especialista em sustentar o grupo contra golpes pesados de chefes. Alta vitalidade e dano consistente, mas reserva menos dicas estratégicas.',
    unlockedByDefault: true,
    unlockRequirementText: 'Disponível desde o início da Jornada.',
    accentColor: '#f59e0b',
    baseStats: {
      maxHp: 90,
      intelligence: 4,
      baseDamage: 16,
      parryChance: 0.14,
      critChance: 0.12,
      critMultiplier: 1.65,
    },
    passiveName: 'Escudo do Escopo',
    passiveDescription: 'Absorve impactos com firmeza, oferecendo a maior reserva de vida do grupo.',
  },
  {
    id: 'mage',
    name: 'Lyra, a Arcanista',
    title: 'Maga do Syllabus',
    role: 'Estrategista & Crítico',
    personality: 'Analítica, curiosa e rigorosa com terminologias oficiais do IREB.',
    description:
      'Domina a base conceitual do CPRE-FL. Eleva drasticamente o pool de dicas compartilhadas e amplifica danos críticos em respostas precisas.',
    unlockedByDefault: false,
    unlockRequirementText: 'Derrote o Arquivista de Pedra (Chefe da Gruta Esquecida).',
    accentColor: '#818cf8',
    baseStats: {
      maxHp: 68,
      intelligence: 9,
      baseDamage: 15,
      parryChance: 0.08,
      critChance: 0.22,
      critMultiplier: 1.9,
    },
    passiveName: 'Clarividência Conceitual',
    passiveDescription: 'Concede a maior carga de inteligência/dicas e multiplicador crítico 2.0×.',
  },
  {
    id: 'rogue',
    name: 'Kael, o Sombra',
    title: 'Ladino da Elicitação',
    role: 'Precisão & Parry',
    personality: 'Ágil, observador e mestre em identificar ambiguidades escondidas.',
    description:
      'Combina alta chance de esquiva/parry contra ataques de chefes com golpes críticos frequentes.',
    unlockedByDefault: false,
    unlockRequirementText: 'Derrote o Espectro das Ambiguidades (Chefe da Caverna Assombrada).',
    accentColor: '#34d399',
    baseStats: {
      maxHp: 78,
      intelligence: 5,
      baseDamage: 16,
      parryChance: 0.24,
      critChance: 0.26,
      critMultiplier: 1.85,
    },
    passiveName: 'Reflexo Crítico',
    passiveDescription: 'Altíssima chance de bloquear contra-ataques (parry) e encaixar acertos críticos.',
  },
  {
    id: 'paladin',
    name: 'Seraphina, a Sentinela',
    title: 'Paladina da Validação',
    role: 'Defesa & Sustentação',
    personality: 'Nobre, metódica e guardiã incansável da rastreabilidade.',
    description:
      'Equilibra vida robusta, excelente parry e suporte consistente para batalhas prolongadas nas regiões finais.',
    unlockedByDefault: false,
    unlockRequirementText: 'Derrote o Guardião Flamejante (Chefe da Caverna de Fogo).',
    accentColor: '#38bdf8',
    baseStats: {
      maxHp: 92,
      intelligence: 6,
      baseDamage: 15,
      parryChance: 0.22,
      critChance: 0.14,
      critMultiplier: 1.75,
    },
    passiveName: 'Égide da Baseline',
    passiveDescription: 'Combina alta sobrevivência, defesa sólida e reserva equilibrada de dicas.',
  },
];

export function getHeroClassDefinition(id: RpgHeroClassId): RpgHeroClassDefinition {
  return RPG_HERO_CLASSES.find((h) => h.id === id) ?? RPG_HERO_CLASSES[0];
}

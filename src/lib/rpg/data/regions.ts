import type { RpgRegionConfig, RpgRegionId } from '@/types/rpg';

export const RPG_REGIONS: RpgRegionConfig[] = [
  {
    index: 0,
    id: 'gruta-esquecida',
    name: 'Gruta Esquecida',
    subtitle: 'Os Alicerces da Engenharia de Requisitos',
    levelRange: [1, 10],
    bossId: 'boss-gruta-guardiao',
    bossName: 'Arquivista de Pedra',
    topicIds: ['fundamentos-er', 'documentacao-qualidade'],
    unlockHeroClassId: 'mage',
    description:
      'Galerias úmidas repletas de inscrições antigas sobre fundamentos, contexto de sistema e qualidade de requisitos.',
    theme: {
      primary: '#38bdf8',
      accent: '#22d3ee',
      bgFrom: '#0b1320',
      bgVia: '#132436',
      bgTo: '#0c1622',
      particleType: 'dust',
      ambientTint: 'rgba(56, 189, 248, 0.14)',
    },
  },
  {
    index: 1,
    id: 'caverna-assombrada',
    name: 'Caverna Assombrada',
    subtitle: 'Ecos da Elicitação e Conflitos Ocultos',
    levelRange: [11, 20],
    bossId: 'boss-caverna-espectro',
    bossName: 'Espectro das Ambiguidades',
    topicIds: ['elicitacao-conflitos', 'modelagem-prototipacao'],
    unlockHeroClassId: 'rogue',
    description:
      'Salões envoltos em névoa onde vozes contraditórias de stakeholders testam sua capacidade de elicitar e modelar requisitos.',
    theme: {
      primary: '#a78bfa',
      accent: '#c084fc',
      bgFrom: '#120d24',
      bgVia: '#221642',
      bgTo: '#0f0a1d',
      particleType: 'mist',
      ambientTint: 'rgba(167, 139, 250, 0.16)',
    },
  },
  {
    index: 2,
    id: 'caverna-de-fogo',
    name: 'Caverna de Fogo',
    subtitle: 'A Forja da Validação e Gerenciamento',
    levelRange: [21, 30],
    bossId: 'boss-fogo-guardiao',
    bossName: 'Guardião Flamejante da Baseline',
    topicIds: ['validacao-verificacao', 'gerenciamento-requisitos'],
    unlockHeroClassId: 'paladin',
    description:
      'Câmaras vulcânicas onde cada mudança sem rastreabilidade ou baseline gera colapsos de lava e testes implacáveis.',
    theme: {
      primary: '#fb923c',
      accent: '#f97316',
      bgFrom: '#1f0d0a',
      bgVia: '#3b150e',
      bgTo: '#160907',
      particleType: 'embers',
      ambientTint: 'rgba(251, 146, 60, 0.18)',
    },
  },
  {
    index: 3,
    id: 'dungeon-de-gelo',
    name: 'Dungeon de Gelo',
    subtitle: 'Cidadela dos Processos e Mestria CPRE-FL',
    levelRange: [31, 40],
    bossId: 'boss-gelo-rei',
    bossName: 'Rei Congelado do Syllabus',
    topicIds: ['processos-ferramentas', 'fundamentos-er', 'gerenciamento-requisitos'],
    description:
      'Fortaleza cristalina no pico da campanha, exigindo domínio completo de processos, ferramentas e de todo o Syllabus IREB.',
    theme: {
      primary: '#67e8f9',
      accent: '#bae6fd',
      bgFrom: '#081826',
      bgVia: '#103147',
      bgTo: '#07131e',
      particleType: 'snow',
      ambientTint: 'rgba(103, 232, 249, 0.16)',
    },
  },
];

export function getRegionByIndex(index: number): RpgRegionConfig {
  return RPG_REGIONS[Math.max(0, Math.min(RPG_REGIONS.length - 1, index))];
}

export function getRegionById(id: RpgRegionId): RpgRegionConfig {
  return RPG_REGIONS.find((r) => r.id === id) ?? RPG_REGIONS[0];
}

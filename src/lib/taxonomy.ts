import type { Topic } from '@/types/domain';

/**
 * Taxonomia temática construída diretamente a partir das 45 questões reais
 * presentes em questoes.json (IREB CPRE Foundation Level).
 * Persistida na Camada 2 e editável manualmente sem alterar o JSON original.
 */
export const DEFAULT_TOPICS: Topic[] = [
  {
    id: 'fundamentos-er',
    name: 'Fundamentos da Engenharia de Requisitos',
    slug: 'fundamentos-er',
    description:
      'Tipos de requisitos, objetivos, tarefas principais, papel do engenheiro de requisitos, princípios, contexto e limite do sistema, entendimento compartilhado e requisitos de domínio.',
    sortOrder: 1,
  },
  {
    id: 'documentacao-qualidade',
    name: 'Documentação e Qualidade de Requisitos',
    slug: 'documentacao-qualidade',
    description:
      'Níveis de abstração, nível de detalhamento, linguagem natural, templates de frases (EARS / verbos modais) e critérios de qualidade individuais e de produtos de trabalho.',
    sortOrder: 2,
  },
  {
    id: 'modelagem-prototipacao',
    name: 'Modelagem e Prototipação',
    slug: 'modelagem-prototipacao',
    description:
      'Conceito e finalidade de modelos, diagramas de contexto (DFD), diagramas de classe/multiplicidades e tipos principais de protótipos.',
    sortOrder: 3,
  },
  {
    id: 'elicitacao-conflitos',
    name: 'Elicitação e Resolução de Conflitos',
    slug: 'elicitacao-conflitos',
    description:
      'Stakeholders, fontes principais de requisitos, técnicas de elicitação (analogia), modelo Kano, tipos de conflito e técnicas de resolução.',
    sortOrder: 4,
  },
  {
    id: 'validacao-verificacao',
    name: 'Validação e Verificação',
    slug: 'validacao-verificacao',
    description:
      'Distinção entre validação e verificação e categorias de técnicas de validação de requisitos.',
    sortOrder: 5,
  },
  {
    id: 'gerenciamento-requisitos',
    name: 'Gerenciamento de Requisitos',
    slug: 'gerenciamento-requisitos',
    description:
      'Atributos de requisitos (risco), rastreabilidade, priorização, configurações e baselines, controle de versão, ciclo de vida (rascunho), IDs exclusivos e visões.',
    sortOrder: 6,
  },
  {
    id: 'processos-ferramentas',
    name: 'Processos e Ferramentas de ER',
    slug: 'processos-ferramentas',
    description:
      'Processos sequenciais vs iterativos/orientados ao produto, fatores de influência na estruturação do processo e seleção/suporte de ferramentas de ER.',
    sortOrder: 7,
  },
];

/**
 * Mapeamento inicial baseado no conteúdo real de cada questão em questoes.json.
 */
export const DEFAULT_QUESTION_TOPIC_MAP: Record<string, string> = {
  // 1. Fundamentos da Engenharia de Requisitos (10)
  'ID-001': 'fundamentos-er',
  'ID-002': 'fundamentos-er',
  'ID-003': 'fundamentos-er',
  'ID-004': 'fundamentos-er',
  'ID-005': 'fundamentos-er',
  'ID-006': 'fundamentos-er',
  'ID-007': 'fundamentos-er',
  'ID-008': 'fundamentos-er',
  'ID-010': 'fundamentos-er',
  'ID-043': 'fundamentos-er',

  // 2. Documentação e Qualidade de Requisitos (9)
  'ID-011': 'documentacao-qualidade',
  'ID-012': 'documentacao-qualidade',
  'ID-013': 'documentacao-qualidade',
  'ID-014': 'documentacao-qualidade',
  'ID-015': 'documentacao-qualidade',
  'ID-016': 'documentacao-qualidade',
  'ID-020': 'documentacao-qualidade',
  'ID-021': 'documentacao-qualidade',
  'ID-022': 'documentacao-qualidade',

  // 3. Modelagem e Prototipação (4)
  'ID-017': 'modelagem-prototipacao',
  'ID-018': 'modelagem-prototipacao',
  'ID-019': 'modelagem-prototipacao',
  'ID-041': 'modelagem-prototipacao',

  // 4. Elicitação e Resolução de Conflitos (6)
  'ID-026': 'elicitacao-conflitos',
  'ID-027': 'elicitacao-conflitos',
  'ID-028': 'elicitacao-conflitos',
  'ID-029': 'elicitacao-conflitos',
  'ID-030': 'elicitacao-conflitos',
  'ID-031': 'elicitacao-conflitos',

  // 5. Validação e Verificação (2)
  'ID-009': 'validacao-verificacao',
  'ID-032': 'validacao-verificacao',

  // 6. Gerenciamento de Requisitos (9)
  'ID-023': 'gerenciamento-requisitos',
  'ID-024': 'gerenciamento-requisitos',
  'ID-025': 'gerenciamento-requisitos',
  'ID-033': 'gerenciamento-requisitos',
  'ID-037': 'gerenciamento-requisitos',
  'ID-039': 'gerenciamento-requisitos',
  'ID-040': 'gerenciamento-requisitos',
  'ID-044': 'gerenciamento-requisitos',
  'ID-045': 'gerenciamento-requisitos',

  // 7. Processos e Ferramentas de ER (5)
  'ID-034': 'processos-ferramentas',
  'ID-035': 'processos-ferramentas',
  'ID-036': 'processos-ferramentas',
  'ID-038': 'processos-ferramentas',
  'ID-042': 'processos-ferramentas',
};

import type { RpgBossDefinition } from '@/types/rpg';

export const RPG_BOSSES: RpgBossDefinition[] = [
  {
    id: 'boss-gruta-guardiao',
    regionId: 'gruta-esquecida',
    regionIndex: 0,
    name: 'Arquivista de Pedra',
    title: 'Guardião dos Fundamentos IREB',
    personality: 'Solene, rígido e implacável com requisitos ambíguos.',
    description:
      'Uma estátua viva forjada com tábuas de especificações antigas. Só permite passagem a quem domina os fundamentos e a qualidade de requisitos.',
    maxHp: 90,
    attackDamage: 20,
    xpReward: 180,
    goldReward: 80,
    guaranteedItemId: 'shield-traceability',
    accentColor: '#38bdf8',
    introLine:
      'Ninguém cruza a Gruta Esquecida sem distinguir o que o sistema deve fazer de como ele deve fazê-lo. Prove seu domínio!',
    tauntLines: [
      'Sua especificação está vaga demais! Sinta o peso da ambiguidade!',
      'Sem clareza conceitual, qualquer projeto desmorona!',
    ],
    hitLines: [
      'Argh! Uma fundamentação precisa... minhas runas racham!',
      'Você realmente compreende os princípios do IREB!',
    ],
    defeatLine:
      'Sua compreensão é sólida como rocha. A passagem para a Caverna Assombrada está aberta — e Lyra se junta à sua causa.',
    prompts: [
      {
        id: 'gruta-p1',
        topicId: 'fundamentos-er',
        question:
          'Explique a diferença entre um requisito funcional e um requisito de qualidade (não funcional) segundo o IREB, apresentando um exemplo prático de cada.',
        expectedAnswer:
          'Requisitos funcionais descrevem o comportamento, funções ou serviços que o sistema deve oferecer (o que o sistema faz). Requisitos de qualidade descrevem quão bem o sistema executa suas funções, como desempenho, usabilidade, segurança ou confiabilidade (como o sistema opera).',
        requiredConcepts: [
          'requisito funcional descreve comportamento ou função do sistema',
          'requisito de qualidade descreve atributos de desempenho, segurança, usabilidade ou confiabilidade',
          'exemplo de requisito funcional',
          'exemplo de requisito de qualidade',
        ],
        complementaryConcepts: ['restrições (constraints)', 'mensurabilidade', 'critérios de aceitação'],
        evaluationCriteria:
          'Avalie se o aluno diferenciou corretamente o escopo de ambos os tipos e forneceu exemplos coerentes com o IREB CPRE-FL.',
      },
      {
        id: 'gruta-p2',
        topicId: 'fundamentos-er',
        question:
          'O que é o limite do sistema (system boundary) e o limite do contexto (context boundary) na Engenharia de Requisitos? Por que defini-los corretamente evita problemas no projeto?',
        expectedAnswer:
          'O limite do sistema separa o sistema a ser desenvolvido do seu ambiente (contexto). O limite do contexto separa os aspectos relevantes do ambiente que influenciam o sistema do restante do mundo irrelevante. Defini-los evita escopo descontrolado (scope creep) e omissão de interfaces importantes.',
        requiredConcepts: [
          'limite do sistema separa o sistema do ambiente/contexto',
          'limite do contexto separa o que é relevante no ambiente do que é irrelevante',
          'impacto na definição de escopo ou interfaces',
        ],
        complementaryConcepts: ['zona cinzenta (gray zone)', 'interfaces externas', 'contexto do sistema'],
        evaluationCriteria:
          'Verifique se o aluno distinguiu os dois limites e justificou sua importância prática.',
      },
      {
        id: 'gruta-p3',
        topicId: 'documentacao-qualidade',
        question:
          'Cite e explique pelo menos três critérios de qualidade de um requisito individual segundo o IREB (ex.: inequívoco, verificável, necessário, consistente, completo).',
        expectedAnswer:
          'Um requisito individual deve ser inequívoco (única interpretação possível), verificável (possível testar ou comprovar se foi atendido), necessário (contribui para um objetivo real), consistente (não contradiz outros requisitos) e viável/exequível.',
        requiredConcepts: [
          'ao menos três critérios de qualidade válidos do IREB',
          'explicação correta de cada critério citado',
        ],
        complementaryConcepts: ['adequado', 'completo', 'compreensível', 'rastreável'],
        evaluationCriteria:
          'Verifique se o aluno citou critérios autênticos do Syllabus IREB e explicou corretamente seu significado.',
      },
    ],
  },
  {
    id: 'boss-caverna-espectro',
    regionId: 'caverna-assombrada',
    regionIndex: 1,
    name: 'Espectro das Ambiguidades',
    title: 'Senhor dos Conflitos Ocultos',
    personality: 'Sarcástico, evasivo e especialista em semear contradições entre stakeholders.',
    description:
      'Nascido de entrevistas mal conduzidas e expectativas implícitas. Só pode ser dissipado com técnicas sólidas de elicitação e modelagem.',
    maxHp: 115,
    attackDamage: 24,
    xpReward: 240,
    goldReward: 115,
    guaranteedItemId: 'staff-ears',
    accentColor: '#a78bfa',
    introLine:
      'Cada stakeholder diz uma coisa diferente... e nenhum deles sabe o que realmente quer! Como você pretende me derrotar?',
    tauntLines: [
      'Hahaha! Você ignorou os requisitos inconscientes do Modelo Kano!',
      'Conflitos não resolvidos alimentam minha força!',
    ],
    hitLines: [
      'NÃO! Sua clareza dissipa minha névoa!',
      'Essa técnica de resolução de conflitos corta direto na minha essência!',
    ],
    defeatLine:
      'As vozes finalmente entraram em consenso... Kael reconhece sua astúcia e se une ao seu grupo!',
    prompts: [
      {
        id: 'caverna-p1',
        topicId: 'elicitacao-conflitos',
        question:
          'Explique as três categorias de fatores do Modelo Kano (básicos/dissatisfiers, de desempenho/satisfiers e de encantamento/delighters) e por que ele é útil na elicitação.',
        expectedAnswer:
          'Fatores básicos são esperados implicitamente (se ausentes geram grande insatisfação, mas presentes não encantam). Fatores de desempenho são explicitamente pedidos e aumentam satisfação proporcionalmente. Fatores de encantamento são inesperados e geram alta satisfação quando presentes. O modelo ajuda a escolher técnicas adequadas para descobrir requisitos implícitos e inovadores.',
        requiredConcepts: [
          'fatores básicos ou implícitos (dissatisfiers)',
          'fatores de desempenho ou explícitos (satisfiers)',
          'fatores de encantamento ou excitadores (delighters)',
          'utilidade na elicitação de requisitos',
        ],
        complementaryConcepts: ['migração ao longo do tempo', 'técnicas de observação ou criatividade'],
        evaluationCriteria:
          'Avalie a explicação correta das 3 categorias do Modelo Kano e sua relação com elicitação.',
      },
      {
        id: 'caverna-p2',
        topicId: 'elicitacao-conflitos',
        question:
          'Compare duas técnicas de resolução de conflitos de requisitos (ex.: acordo/compromisso, consenso/colaboração, votação ou imposição) indicando qual tende a gerar efeitos mais duradouros e por quê.',
        expectedAnswer:
          'Acordo (compromisso) ou colaboração/consenso envolve negociação entre stakeholders buscando solução aceitável para todos, gerando maior comprometimento e efeito mais prolongado. Já imposição ou escolha aleatória pode resolver rápido, mas gera resistência e novos conflitos futuros.',
        requiredConcepts: [
          'comparação entre duas técnicas válidas de resolução de conflitos',
          'identificação de técnica colaborativa/acordo como mais duradoura',
          'justificativa baseada em aceitação/comprometimento dos stakeholders',
        ],
        complementaryConcepts: ['tipos de conflito (dados, interesse, valor, relacionamento, estrutural)'],
        evaluationCriteria:
          'Avalie se o aluno comparou corretamente técnicas de resolução de conflitos do IREB.',
      },
      {
        id: 'caverna-p3',
        topicId: 'modelagem-prototipacao',
        question:
          'Qual é a diferença entre um protótipo exploratório (descartável) e um protótipo evolutivo? Em que situação cada um é mais indicado?',
        expectedAnswer:
          'O protótipo exploratório/descartável é criado rapidamente para validar ideias, esclarecer requisitos e explorar alternativas, sendo descartado após o aprendizado. O protótipo evolutivo é construído com qualidade de produção para ser refinado continuamente até se tornar o sistema final.',
        requiredConcepts: [
          'protótipo exploratório/descartável serve para esclarecer requisitos e é descartado',
          'protótipo evolutivo evolui até virar o sistema final',
          'contexto de uso de cada um',
        ],
        complementaryConcepts: ['wireframes/mockups', 'redução de risco', 'feedback rápido de stakeholders'],
        evaluationCriteria:
          'Verifique a distinção conceitual clara e o contexto de aplicação.',
      },
    ],
  },
  {
    id: 'boss-fogo-guardiao',
    regionId: 'caverna-de-fogo',
    regionIndex: 2,
    name: 'Guardião Flamejante da Baseline',
    title: 'Senhor do Controle de Mudanças',
    personality: 'Intenso, rigoroso e inflexível contra alterações sem rastreabilidade.',
    description:
      'Forjado em magma de mudanças não gerenciadas. Testa seu domínio sobre validação, verificação, baselines e rastreabilidade.',
    maxHp: 140,
    attackDamage: 28,
    xpReward: 310,
    goldReward: 150,
    guaranteedItemId: 'cloak-stakeholder',
    accentColor: '#fb923c',
    introLine:
      'Mudanças sem impacto analisado incendeiam qualquer entrega! Mostre que você sabe validar e gerenciar requisitos!',
    tauntLines: [
      'Sem rastreabilidade, sua mudança vai queimar todo o sistema!',
      'Você confundiu validação com verificação! Sinta as chamas!',
    ],
    hitLines: [
      'Fogo controlado! Sua rastreabilidade é impecável!',
      'Uma análise de impacto digna de um Engenheiro de Requisitos!',
    ],
    defeatLine:
      'As chamas se acalmam diante da sua disciplina. Seraphina se junta ao grupo para a ascensão final!',
    prompts: [
      {
        id: 'fogo-p1',
        topicId: 'validacao-verificacao',
        question:
          'Explique a diferença entre Validação e Verificação de requisitos segundo o IREB CPRE-FL, e cite duas técnicas de validação.',
        expectedAnswer:
          'Validação verifica se estamos construindo o sistema certo — ou seja, se os requisitos refletem corretamente as reais necessidades e expectativas dos stakeholders. Verificação checa se os requisitos foram elaborados corretamente conforme padrões, regras de qualidade e consistência interna. Técnicas de validação incluem revisão (inspeção, walkthrough), prototipação, testes de aceitação e checklists.',
        requiredConcepts: [
          'validação verifica atendimento às reais necessidades dos stakeholders (sistema certo)',
          'verificação verifica conformidade com padrões e critérios de qualidade (construir certo)',
          'citação de técnicas de validação',
        ],
        complementaryConcepts: ['inspeção formal', 'walkthrough', 'leitura baseada em perspectiva'],
        evaluationCriteria:
          'Verifique se a distinção clássica validação vs. verificação está correta e acompanhada de técnicas reais.',
      },
      {
        id: 'fogo-p2',
        topicId: 'gerenciamento-requisitos',
        question:
          'O que é rastreabilidade de requisitos (pré-rastreabilidade e pós-rastreabilidade) e como ela apoia a análise de impacto de mudanças?',
        expectedAnswer:
          'Rastreabilidade é a capacidade de seguir a vida de um requisito em ambas as direções. Pré-rastreabilidade liga o requisito à sua origem (stakeholder, norma, objetivo de negócio). Pós-rastreabilidade liga o requisito aos artefatos derivados (arquitetura, código, casos de teste). Na análise de impacto, permite identificar rapidamente quais componentes e testes serão afetados por uma mudança.',
        requiredConcepts: [
          'definição de rastreabilidade',
          'pré-rastreabilidade (origem/fonte do requisito)',
          'pós-rastreabilidade (artefatos derivados como código e testes)',
          'apoio à análise de impacto de mudanças',
        ],
        complementaryConcepts: ['matriz de rastreabilidade', 'requisitos órfãos', 'cobertura de testes'],
        evaluationCriteria:
          'Avalie se o aluno cobriu ambas as direções da rastreabilidade e o papel na análise de impacto.',
      },
      {
        id: 'fogo-p3',
        topicId: 'gerenciamento-requisitos',
        question:
          'O que é uma baseline (linha de base) de requisitos e qual sua relação com o controle de versões e mudanças?',
        expectedAnswer:
          'Uma baseline é uma configuração estável, revisada e formalmente aprovada de um conjunto de requisitos em determinado ponto do projeto, servindo como referência para o desenvolvimento. Após estabelecida, alterações exigem controle formal de mudanças (change control) e geram novas versões/baselines.',
        requiredConcepts: [
          'baseline é uma configuração estável e aprovada de requisitos',
          'serve como ponto de referência para o projeto',
          'alterações posteriores passam por controle de mudanças e versionamento',
        ],
        complementaryConcepts: ['CCB (Change Control Board)', 'gerenciamento de configuração', 'versionamento'],
        evaluationCriteria:
          'Verifique a precisão conceitual sobre baseline e controle de mudanças.',
      },
    ],
  },
  {
    id: 'boss-gelo-rei',
    regionId: 'dungeon-de-gelo',
    regionIndex: 3,
    name: 'Rei Congelado do Syllabus',
    title: 'Soberano da Certificação CPRE-FL',
    personality: 'Majestoso, exigente e guardião supremo de todo o conhecimento IREB.',
    description:
      'O desafio final da campanha. Exige visão sistêmica sobre processos de ER, ferramentas e integração dos 9 princípios fundamentais.',
    maxHp: 170,
    attackDamage: 32,
    xpReward: 450,
    goldReward: 250,
    guaranteedItemId: 'crown-baseline',
    accentColor: '#67e8f9',
    introLine:
      'Você chegou ao trono de gelo. Somente quem domina processos, ferramentas e princípios do IREB merece o título de Mestre CPRE-FL!',
    tauntLines: [
      'Um processo mal escolhido congela a entrega de valor!',
      'Ferramentas não salvam um processo de ER inexistente!',
    ],
    hitLines: [
      'Impressionante! Sua síntese atravessa minha armadura glacial!',
      'O gelo cede diante de tamanha maestria conceitual!',
    ],
    defeatLine:
      'Você conquistou a Jornada do Herói e provou domínio completo do IREB CPRE-FL! A Coroa da Baseline Dourada é sua!',
    prompts: [
      {
        id: 'gelo-p1',
        topicId: 'processos-ferramentas',
        question:
          'Compare um processo de Engenharia de Requisitos orientado a fases/sequencial com um processo iterativo/ágil, explicando quais fatores influenciam a escolha do processo ideal.',
        expectedAnswer:
          'No processo sequencial (orientado a fases), os requisitos são especificados extensivamente antes da implementação, adequado a domínios estáveis ou altamente regulados. No iterativo/ágil, requisitos evoluem continuamente em ciclos curtos com feedback frequente, ideal para alta incerteza. Fatores de influência incluem estabilidade do domínio, criticidade/regulação, cultura organizacional, disponibilidade de stakeholders e prazo/orçamento.',
        requiredConcepts: [
          'características do processo sequencial/orientado a fases',
          'características do processo iterativo/ágil',
          'fatores de influência na escolha do processo',
        ],
        complementaryConcepts: ['orientado ao produto vs orientado ao projeto', 'time-to-market', 'risco'],
        evaluationCriteria:
          'Avalie a comparação entre abordagens e a citação coerente de fatores de influência do IREB.',
      },
      {
        id: 'gelo-p2',
        topicId: 'processos-ferramentas',
        question:
          'Por que o IREB enfatiza que uma ferramenta de Engenharia de Requisitos deve apoiar um processo existente — e não substituí-lo? Cite dois cuidados ao selecionar uma ferramenta de ER.',
        expectedAnswer:
          'Porque ferramentas automatizam e dão suporte a práticas já definidas; adotar uma ferramenta sem processo claro apenas automatiza o caos. Cuidados na seleção incluem alinhamento ao processo e necessidades da equipe, custo total (licença, treinamento, manutenção), integração com outras ferramentas (testes/issues), escalabilidade e curva de aprendizado.',
        requiredConcepts: [
          'ferramenta apoia o processo e não substitui a falta dele',
          'ao menos dois critérios ou cuidados na seleção de ferramentas de ER',
        ],
        complementaryConcepts: ['projeto piloto', 'interoperabilidade (ReqIF)', 'treinamento'],
        evaluationCriteria:
          'Verifique se o aluno explicou a relação processo-ferramenta e apresentou critérios práticos de seleção.',
      },
      {
        id: 'gelo-p3',
        topicId: 'fundamentos-er',
        question:
          'Explique o princípio do "Entendimento Compartilhado" (Shared Understanding) no IREB CPRE-FL e diferencie entendimento compartilhado explícito de implícito.',
        expectedAnswer:
          'Entendimento compartilhado ocorre quando todos os stakeholders envolvidos possuem a mesma compreensão sobre os requisitos, objetivos e contexto do sistema. O implícito baseia-se em conhecimento comum, cultura ou experiência prévia não documentada; o explícito é formalizado em documentação, modelos ou protótipos validados para reduzir ambiguidades.',
        requiredConcepts: [
          'definição de entendimento compartilhado entre stakeholders',
          'diferença entre entendimento implícito e explícito',
          'papel na redução de mal-entendidos ou retrabalho',
        ],
        complementaryConcepts: ['glossário', '9 princípios fundamentais do IREB', 'comunicação contínua'],
        evaluationCriteria:
          'Avalie a clareza na distinção entre implícito e explícito e sua importância no IREB.',
      },
    ],
  },
];

export function getBossById(bossId: string): RpgBossDefinition {
  return RPG_BOSSES.find((b) => b.id === bossId) ?? RPG_BOSSES[0];
}

export function getBossByRegionIndex(regionIndex: number): RpgBossDefinition {
  return RPG_BOSSES.find((b) => b.regionIndex === regionIndex) ?? RPG_BOSSES[0];
}

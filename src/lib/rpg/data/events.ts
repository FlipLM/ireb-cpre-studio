import type { RpgEventDefinition } from '@/types/rpg';

export const RPG_EVENTS: RpgEventDefinition[] = [
  {
    id: 'evt-viajante-glossario',
    kind: 'event',
    title: 'O Viajante do Glossário Perdido',
    description:
      'Um escriba encapuzado oferece compartilhar anotações raras do Syllabus em troca de parte do seu tempo e atenção. O caminho à frente parece mais claro se você parar para ouvi-lo.',
    speakerName: 'Escriba Errante',
    speakerRole: 'Guardião de Termos',
    choices: [
      {
        id: 'estudar-notas',
        label: 'Estudar as anotações com calma',
        description: 'Ganha +2 dicas compartilhadas e +25 XP.',
        riskTag: 'safe',
        outcome: {
          narrative:
            'Você revisa definições precisas de termos do IREB. A mente do grupo fica mais afiada e pronta para os próximos desafios.',
          hintsDelta: 2,
          xpDelta: 25,
        },
      },
      {
        id: 'trocar-relatorio',
        label: 'Aceitar o artefato selado do escriba',
        description: 'Recebe uma Lente da Triagem (elimina 1 alternativa errada) e +15 XP.',
        riskTag: 'balanced',
        outcome: {
          narrative:
            'O escriba entrega uma Lente da Triagem lapidada em cristal. Ela será valiosa nas questões mais traiçoeiras.',
          grantItemId: 'lens-elimination-common',
          xpDelta: 15,
        },
      },
    ],
  },
  {
    id: 'evt-fonte-clareza',
    kind: 'event',
    title: 'Fonte Luminosa da Clareza',
    description:
      'Em uma câmara silenciosa, uma fonte cristalina emana energia restauradora. O grupo pode descansar brevemente ou coletar parte da essência para batalhas futuras.',
    speakerName: 'Narrador',
    speakerRole: 'Ambiente',
    choices: [
      {
        id: 'beber-fonte',
        label: 'Restaurar as forças do grupo',
        description: 'Recupera +35 HP para todos os heróis equipados.',
        riskTag: 'safe',
        outcome: {
          narrative:
            'A água luminosa revitaliza imediatamente os heróis equipados, fechando ferimentos de confrontos anteriores.',
          hpDelta: 35,
          xpDelta: 15,
        },
      },
      {
        id: 'coletar-frasco',
        label: 'Engarrafar uma Poção de Vitalidade',
        description: 'Adiciona 1 Poção de Vitalidade ao inventário.',
        riskTag: 'balanced',
        outcome: {
          narrative:
            'Você guarda cuidadosamente a essência em um frasco selado para usar no momento mais crítico.',
          grantItemId: 'potion-minor-heal',
          xpDelta: 18,
        },
      },
    ],
  },
  {
    id: 'evt-passagem-secreta',
    kind: 'event',
    title: 'Passagem Secreta dos Stakeholders',
    description:
      'Atrás de um mural rachado há uma galeria estreita marcada com símbolos de rastreabilidade. Pode conter um item raro — ou uma armadilha de escopo.',
    speakerName: 'Aldric, o Guardião',
    speakerRole: 'Batedor',
    choices: [
      {
        id: 'explorar-galeria',
        label: 'Explorar a galeria arriscada',
        description: 'Recebe 1 Prisma da Precisão (raro, elimina 2 erradas) e +40 XP, mas sofre -12 HP pela armadilha.',
        riskTag: 'risky',
        outcome: {
          narrative:
            'Uma armadilha de estalactites atinge de raspão o grupo, mas vocês recuperam um reluzente Prisma da Precisão!',
          grantItemId: 'prism-elimination-rare',
          hpDelta: -12,
          xpDelta: 40,
        },
      },
      {
        id: 'contornar-seguro',
        label: 'Seguir pela rota principal em segurança',
        description: 'Avança sem danos e ganha +20 XP e +1 dica.',
        riskTag: 'safe',
        outcome: {
          narrative:
            'Você evita o risco desnecessário e aproveita a marcha tranquila para revisar os fundamentos do grupo.',
          hintsDelta: 1,
          xpDelta: 20,
        },
      },
    ],
  },
  {
    id: 'gap-escopo-inesperado',
    kind: 'gap',
    title: 'GAP DE ESCOPO — Mudança Súbita de Requisitos!',
    description:
      'Um mensageiro surge ofegante trazendo uma alteração de última hora de um stakeholder influente. Como o grupo reage a esse imprevisto na jornada?',
    speakerName: 'Mensageiro da Corte',
    speakerRole: 'Evento Gap',
    choices: [
      {
        id: 'analisar-impacto',
        label: 'Realizar Análise de Impacto formal',
        description: 'Consome 1 dica, mas concede +45 XP e bônus de +8 dano nos próximos 2 turnos de chefe.',
        riskTag: 'balanced',
        outcome: {
          narrative:
            'Sua análise disciplinada evita retrabalho e fortalece a estratégia tática do grupo para o próximo combate!',
          hintsDelta: -1,
          xpDelta: 45,
          tempDamageBonus: 8,
        },
      },
      {
        id: 'absorver-pressao',
        label: 'Absorver a mudança sem análise prévia',
        description: 'Recebe +35 ouro, mas o desgaste custa -15 HP ao grupo.',
        riskTag: 'risky',
        outcome: {
          narrative:
            'O stakeholder agradece com ouro, mas a correria cobra seu preço na resistência dos heróis.',
          goldDelta: 35,
          hpDelta: -15,
          xpDelta: 20,
        },
      },
      {
        id: 'negociar-baseline',
        label: 'Negociar inclusão na próxima baseline',
        description: 'Mantém o grupo intacto, ganha +25 XP e +10% parry temporário.',
        riskTag: 'safe',
        outcome: {
          narrative:
            'Com argumentos sólidos do IREB, você protege a baseline atual e eleva a postura defensiva do grupo.',
          xpDelta: 25,
          tempParryBonus: 0.1,
        },
      },
    ],
  },
  {
    id: 'gap-fenda-conhecimento',
    kind: 'gap',
    title: 'GAP TÁTICO — Fenda da Revisão Relâmpago',
    description:
      'Uma fenda arcana se abre no corredor, oferecendo um atalho de treinamento intensivo com o Prof. IREB antes do próximo confronto.',
    speakerName: 'Prof. IREB',
    speakerRole: 'Mentor Arcano',
    choices: [
      {
        id: 'aceitar-mentoria',
        label: 'Aceitar a revisão tática',
        description: 'Recebe +1 Pergaminho de Insight e +30 XP.',
        riskTag: 'safe',
        outcome: {
          narrative:
            'O Prof. IREB destaca exatamente os pontos que costumam derrubar candidatos no exame e entrega um Pergaminho de Insight.',
          grantItemId: 'scroll-insight',
          xpDelta: 30,
        },
      },
      {
        id: 'forjar-foco',
        label: 'Treinar reflexos contra chefes',
        description: 'Recebe 1 Tônico de Foco Tático e +25 XP.',
        riskTag: 'balanced',
        outcome: {
          narrative:
            'Você pratica argumentos concisos e estruturados, garantindo um Tônico de Foco Tático na mochila.',
          grantItemId: 'tonic-fury',
          xpDelta: 25,
        },
      },
    ],
  },
];

export function getEventById(eventId: string): RpgEventDefinition {
  return RPG_EVENTS.find((e) => e.id === eventId) ?? RPG_EVENTS[0];
}

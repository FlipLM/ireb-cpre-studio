import type { RpgDialogueScene, RpgRegionId } from '@/types/rpg';

export const RPG_DIALOGUES: Record<string, RpgDialogueScene> = {
  'intro-gruta-esquecida': {
    id: 'intro-gruta-esquecida',
    title: 'Prólogo — A Gruta Esquecida',
    regionId: 'gruta-esquecida',
    lines: [
      {
        speakerName: 'Prof. IREB',
        speakerRole: 'Cronista do Syllabus',
        portraitId: 'professor',
        mood: 'serious',
        text: 'Bem-vindo à Jornada do Herói, aprendiz. Quatro regiões guardam os pilares do IREB CPRE Foundation Level — e cada uma termina diante de um Chefe implacável.',
      },
      {
        speakerName: 'Aldric, o Guardião',
        speakerRole: 'Guerreiro de Requisitos',
        portraitId: 'warrior',
        mood: 'neutral',
        text: 'Há muito tempo, exploradores se perderam na Gruta Esquecida por não distinguirem requisitos de soluções. Meu escudo está pronto: escolha o primeiro ponto no mapa e vamos avançar!',
      },
      {
        speakerName: 'Prof. IREB',
        speakerRole: 'Cronista do Syllabus',
        portraitId: 'professor',
        mood: 'happy',
        text: 'Lembre-se: use suas dicas compartilhadas com sabedoria, descanse nos Checkpoints para gerenciar heróis e guarde itens de eliminação para as bifurcações mais difíceis.',
      },
    ],
  },
  'intro-caverna-assombrada': {
    id: 'intro-caverna-assombrada',
    title: 'Capítulo II — A Caverna Assombrada',
    regionId: 'caverna-assombrada',
    lines: [
      {
        speakerName: 'Lyra, a Arcanista',
        speakerRole: 'Maga do Syllabus',
        portraitId: 'mage',
        mood: 'serious',
        text: 'O Arquivista de Pedra caiu, mas adiante a névoa da Caverna Assombrada distorce as falas dos stakeholders. Você pode me equipar no próximo Checkpoint para ampliar nosso pool de dicas!',
      },
      {
        speakerName: 'Aldric, o Guardião',
        speakerRole: 'Guerreiro de Requisitos',
        portraitId: 'warrior',
        mood: 'warning',
        text: 'Elicitação, Modelo Kano, conflitos e protótipos... o Espectro das Ambiguidades nos espera no décimo nível desta região.',
      },
    ],
  },
  'intro-caverna-de-fogo': {
    id: 'intro-caverna-de-fogo',
    title: 'Capítulo III — A Caverna de Fogo',
    regionId: 'caverna-de-fogo',
    lines: [
      {
        speakerName: 'Kael, o Sombra',
        speakerRole: 'Ladino da Elicitação',
        portraitId: 'rogue',
        mood: 'happy',
        text: 'A névoa se foi! Agora entramos na forja onde mudanças sem rastreabilidade viram cinzas. Se precisar de parry e acertos críticos, me equipe no Checkpoint!',
      },
      {
        speakerName: 'Prof. IREB',
        speakerRole: 'Cronista do Syllabus',
        portraitId: 'professor',
        mood: 'serious',
        text: 'Aqui reinam Validação, Verificação, Baselines e Gerenciamento de Requisitos. O Guardião Flamejante testará sua disciplina técnica.',
      },
    ],
  },
  'intro-dungeon-de-gelo': {
    id: 'intro-dungeon-de-gelo',
    title: 'Capítulo IV — A Dungeon de Gelo',
    regionId: 'dungeon-de-gelo',
    lines: [
      {
        speakerName: 'Seraphina, a Sentinela',
        speakerRole: 'Paladina da Validação',
        portraitId: 'paladin',
        mood: 'serious',
        text: 'A cidadela final se ergue diante de nós. Com até três heróis equipados, temos força total para encarar os Processos, Ferramentas e o Rei Congelado do Syllabus.',
      },
      {
        speakerName: 'Prof. IREB',
        speakerRole: 'Cronista do Syllabus',
        portraitId: 'professor',
        mood: 'happy',
        text: 'Derrote o Rei Congelado no nível 40 e você completará toda a campanha da Jornada do Herói!',
      },
    ],
  },
};

export function getRegionIntroDialogue(regionId: RpgRegionId): RpgDialogueScene {
  return RPG_DIALOGUES[`intro-${regionId}`] ?? RPG_DIALOGUES['intro-gruta-esquecida'];
}

import { RPG_BALANCE } from '@/lib/rpg/balance';
import { RPG_EVENTS } from '@/lib/rpg/data/events';
import { getRegionByIndex } from '@/lib/rpg/data/regions';
import { DEFAULT_QUESTION_TOPIC_MAP } from '@/lib/taxonomy';
import type { RpgMapNode, RpgNodeType, RpgRarity, RpgRegionMapGraph } from '@/types/rpg';

/**
 * PRNG determinístico (FNV-1a + Mulberry32) para garantir que o mesmo `seed`
 * gere exatamente o mesmo mapa em qualquer recarregamento ou servidor.
 */
function hashSeed(seed: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function createRng(seed: string): () => number {
  let a = hashSeed(seed) || 1;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickDeterministic<T>(arr: readonly T[], rng: () => number): T {
  return arr[Math.floor(rng() * arr.length) % arr.length];
}

function getQuestionsForTopics(topicIds: string[], allQuestionCodes: string[]): string[] {
  const matched = allQuestionCodes.filter((code) => {
    const topic = DEFAULT_QUESTION_TOPIC_MAP[code];
    return topic ? topicIds.includes(topic) : false;
  });
  return matched.length >= 12 ? matched : allQuestionCodes;
}

const NODE_LABELS: Record<RpgNodeType, string> = {
  start: 'Entrada da Região',
  question: 'Desafio IREB',
  event: 'Evento Narrativo',
  gap: 'Fenda Gap',
  chest: 'Baú Protegido',
  checkpoint: 'Checkpoint',
  special: 'Provação de Elite',
  boss: 'Chefe da Região',
};

/**
 * Gera um mapa DAG determinístico de 10 níveis por região inspirado em For The King:
 * - Nível 1: Entrada (start)
 * - Níveis 2, 3, 5, 6, 7, 9: Bifurcações (2 a 3 nós conectados entre si sem ciclos)
 * - Níveis 4 e 8: Checkpoints (pontos de convergência para cura e gestão do grupo)
 * - Nível 10: Chefe da Região (ponto final convergente)
 */
export function generateRegionMap(params: {
  regionIndex: number;
  seed: string;
  availableQuestionCodes: string[];
}): RpgRegionMapGraph {
  const region = getRegionByIndex(params.regionIndex);
  const regionSeed = `${params.seed}::region-${region.index}-${region.id}`;
  const rng = createRng(regionSeed);

  const topicPool = getQuestionsForTopics(region.topicIds, params.availableQuestionCodes);
  const shuffledQuestions = [...topicPool];
  for (let i = shuffledQuestions.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffledQuestions[i], shuffledQuestions[j]] = [shuffledQuestions[j], shuffledQuestions[i]];
  }
  let qCursor = 0;
  const nextQuestionCode = () => {
    if (shuffledQuestions.length === 0) return 'ID-001';
    const code = shuffledQuestions[qCursor % shuffledQuestions.length];
    qCursor += 1;
    return code;
  };

  const regularEvents = RPG_EVENTS.filter((e) => e.kind === 'event');
  const gapEvents = RPG_EVENTS.filter((e) => e.kind === 'gap');

  const levelsPerRegion = RPG_BALANCE.campaign.levelsPerRegion;
  const checkpointSet = new Set(RPG_BALANCE.campaign.checkpointLevels);

  const columns: RpgMapNode[][] = [];

  for (let level = 1; level <= levelsPerRegion; level++) {
    const globalLevel = region.index * levelsPerRegion + level;
    const colIndex = level - 1;
    const colNodes: RpgMapNode[] = [];

    if (level === 1) {
      colNodes.push({
        id: `r${region.index}-n1-c`,
        level,
        globalLevel,
        column: colIndex,
        lane: 1,
        type: 'start',
        label: NODE_LABELS.start,
        nextIds: [],
        prevIds: [],
        riskLevel: 'low',
      });
    } else if (level === levelsPerRegion) {
      colNodes.push({
        id: `r${region.index}-n10-boss`,
        level,
        globalLevel,
        column: colIndex,
        lane: 1,
        type: 'boss',
        label: region.bossName,
        nextIds: [],
        prevIds: [],
        riskLevel: 'high',
      });
    } else if (checkpointSet.has(level)) {
      colNodes.push({
        id: `r${region.index}-n${level}-cp`,
        level,
        globalLevel,
        column: colIndex,
        lane: 1,
        type: 'checkpoint',
        label: `Checkpoint ${level === 4 ? 'I' : 'II'}`,
        nextIds: [],
        prevIds: [],
        riskLevel: 'low',
      });
    } else {
      // Árvore tática elaborada e desafiadora (3 caminhos ramificados, sem rotas pacíficas nem baús grátis)
      const lanes = [0, 1, 2];

      lanes.forEach((lane, idx) => {
        let type: RpgNodeType = 'question';
        let riskLevel: 'low' | 'medium' | 'high' = 'medium';
        let eventId: string | undefined;
        let questionCodigo: string | undefined;

        if (level === 2) {
          // 100% combate obrigatório logo na entrada
          type = lane === 2 ? 'special' : 'question';
          riskLevel = lane === 2 ? 'high' : 'medium';
        } else if (level === 3) {
          type = lane === 0 ? 'special' : lane === 1 ? 'question' : 'event';
          riskLevel = lane === 0 ? 'high' : lane === 1 ? 'medium' : 'low';
        } else if (level === 4) {
          // 100% combate obrigatório antes do Checkpoint I
          type = lane === 1 ? 'special' : 'question';
          riskLevel = lane === 1 ? 'high' : 'medium';
        } else if (level === 6) {
          // 100% combate obrigatório após o Checkpoint I
          type = lane === 0 || lane === 2 ? 'special' : 'question';
          riskLevel = lane === 1 ? 'medium' : 'high';
        } else if (level === 7) {
          type = lane === 1 ? 'gap' : 'question';
          riskLevel = lane === 1 ? 'medium' : 'medium';
        } else if (level === 9) {
          // Guarda de Elite do Chefe: 100% combate obrigatório
          type = lane === 1 ? 'question' : 'special';
          riskLevel = lane === 1 ? 'medium' : 'high';
        }

        if (type === 'question' || type === 'special') {
          questionCodigo = nextQuestionCode();
        } else if (type === 'event') {
          eventId = pickDeterministic(regularEvents, rng).id;
        } else if (type === 'gap') {
          eventId = pickDeterministic(gapEvents, rng).id;
        }

        colNodes.push({
          id: `r${region.index}-n${level}-l${lane}`,
          level,
          globalLevel,
          column: colIndex,
          lane,
          type,
          label: NODE_LABELS[type],
          nextIds: [],
          prevIds: [],
          questionCodigo,
          eventId,
          isAlternativePath: idx > 0,
          riskLevel,
        });
      });
    }

    columns.push(colNodes);
  }

  // Conecta colunas adjacentes garantindo DAG válido, sem nós órfãos e sem ciclos
  for (let c = 0; c < columns.length - 1; c++) {
    const curr = columns[c];
    const next = columns[c + 1];

    if (curr.length === 1) {
      for (const n of next) {
        curr[0].nextIds.push(n.id);
        n.prevIds.push(curr[0].id);
      }
    } else if (next.length === 1) {
      for (const p of curr) {
        p.nextIds.push(next[0].id);
        next[0].prevIds.push(p.id);
      }
    } else {
      // Conecta cada nó ao nó mais próximo de lane na coluna seguinte + 1 conexão cruzada
      for (const p of curr) {
        const sorted = [...next].sort(
          (a, b) => Math.abs(a.lane - p.lane) - Math.abs(b.lane - p.lane)
        );
        const primary = sorted[0];
        p.nextIds.push(primary.id);
        primary.prevIds.push(p.id);

        if (sorted[1] && Math.abs(sorted[1].lane - p.lane) <= 2) {
          p.nextIds.push(sorted[1].id);
          sorted[1].prevIds.push(p.id);
        }
      }
      // Garante que nenhum nó da próxima coluna ficou inacessível
      for (const n of next) {
        if (n.prevIds.length === 0) {
          const nearestPrev = [...curr].sort(
            (a, b) => Math.abs(a.lane - n.lane) - Math.abs(b.lane - n.lane)
          )[0];
          nearestPrev.nextIds.push(n.id);
          n.prevIds.push(nearestPrev.id);
        }
      }
    }
  }

  const nodes = columns.flat();
  return {
    regionIndex: region.index,
    regionId: region.id,
    seed: regionSeed,
    nodes,
    startNodeId: columns[0][0].id,
    bossNodeId: columns[columns.length - 1][0].id,
  };
}

/**
 * Valida estruturalmente um grafo de mapa de região:
 * - Todos os nós são alcançáveis a partir de `startNodeId`.
 * - Existe caminho até `bossNodeId`.
 * - Não há ciclos (DAG estrito).
 */
export function validateRegionMapGraph(graph: RpgRegionMapGraph): {
  valid: boolean;
  unreachableNodeIds: string[];
  hasCycle: boolean;
  reachesBoss: boolean;
} {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const visited = new Set<string>();
  const queue = [graph.startNodeId];

  while (queue.length > 0) {
    const id = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);
    const node = byId.get(id);
    if (!node) continue;
    for (const nextId of node.nextIds) {
      if (!visited.has(nextId)) queue.push(nextId);
    }
  }

  const unreachableNodeIds = graph.nodes.filter((n) => !visited.has(n.id)).map((n) => n.id);
  const reachesBoss = visited.has(graph.bossNodeId);

  // Detecção de ciclo via DFS com 3 cores
  const state = new Map<string, 0 | 1 | 2>();
  let hasCycle = false;
  const dfs = (id: string) => {
    state.set(id, 1);
    const node = byId.get(id);
    if (node) {
      for (const nextId of node.nextIds) {
        const st = state.get(nextId) ?? 0;
        if (st === 1) {
          hasCycle = true;
        } else if (st === 0) {
          dfs(nextId);
        }
      }
    }
    state.set(id, 2);
  };
  for (const n of graph.nodes) {
    if ((state.get(n.id) ?? 0) === 0) dfs(n.id);
  }

  return {
    valid: unreachableNodeIds.length === 0 && reachesBoss && !hasCycle,
    unreachableNodeIds,
    hasCycle,
    reachesBoss,
  };
}

/**
 * Calcula quais nós estão disponíveis para seleção pelo jogador com base nos nós concluídos.
 */
export function getAvailableNodeIds(
  graph: RpgRegionMapGraph,
  completedNodeIds: string[]
): string[] {
  const completed = new Set(completedNodeIds);
  if (completed.size === 0) {
    return [graph.startNodeId];
  }

  const available = new Set<string>();
  for (const node of graph.nodes) {
    if (completed.has(node.id)) continue;
    if (node.prevIds.some((prevId) => completed.has(prevId))) {
      available.add(node.id);
    }
  }
  return Array.from(available);
}

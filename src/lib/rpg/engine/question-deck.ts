/**
 * Embaralhamento Fisher-Yates imparcial.
 */
export function shuffleArray<T>(items: readonly T[], rng: () => number = Math.random): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1)) % (i + 1);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/**
 * Seleciona aleatoriamente a próxima questão dentre TODA a base disponível,
 * garantindo que nenhuma questão se repita na mesma run enquanto ainda houver
 * questões não utilizadas. Quando todas forem completadas na run, inicia um
 * novo ciclo aleatório equilibrado (escolhendo apenas entre as menos usadas).
 */
export function pickNextRunQuestion<T extends { codigo: string }>(
  allQuestions: readonly T[],
  runUsedCodes: readonly string[],
  rng: () => number = Math.random
): T {
  if (allQuestions.length === 0) {
    throw new Error('Base de questões vazia para o módulo RPG.');
  }

  const validCodes = new Set(allQuestions.map((q) => q.codigo));
  const usageCounts = new Map<string, number>();

  for (const code of runUsedCodes) {
    if (validCodes.has(code)) {
      usageCounts.set(code, (usageCounts.get(code) ?? 0) + 1);
    }
  }

  let minUsage = Infinity;
  for (const q of allQuestions) {
    const count = usageCounts.get(q.codigo) ?? 0;
    if (count < minUsage) {
      minUsage = count;
      if (minUsage === 0) break;
    }
  }

  const candidates = allQuestions.filter((q) => (usageCounts.get(q.codigo) ?? 0) === minUsage);
  const idx = Math.floor(rng() * candidates.length) % candidates.length;
  return candidates[idx];
}

/**
 * Extrai todos os códigos de questões já utilizados em uma campanha (run)
 * a partir das resoluções de nós salvas em `rpg_node_resolutions`.
 */
export function extractUsedQuestionCodesFromResolutions(
  resolutions: Array<{ question_codigo?: unknown; outcome_json?: unknown }>
): string[] {
  const used: string[] = [];

  for (const row of resolutions) {
    const outcome = row.outcome_json as
      | { encounter?: { usedQuestionCodes?: unknown } }
      | null
      | undefined;
    const encounterCodes = outcome?.encounter?.usedQuestionCodes;

    if (Array.isArray(encounterCodes) && encounterCodes.length > 0) {
      for (const code of encounterCodes) {
        if (typeof code === 'string' && code.length > 0) {
          used.push(code);
        }
      }
    } else if (typeof row.question_codigo === 'string' && row.question_codigo.length > 0) {
      used.push(row.question_codigo);
    }
  }

  return used;
}

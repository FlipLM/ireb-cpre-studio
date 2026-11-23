import fs from 'node:fs';
import path from 'node:path';

const SKILL_RELATIVE_PATH = path.join('prompts', 'professor-ireb.skill.md');

const FALLBACK_SKILL_BODY = `Você é o "Prof. IREB", professor especialista em IREB CPRE-FL.
Dê dicas focadas em pontos-chave conceituais que o aluno deve lembrar para responder sozinho.
NUNCA revele a letra ou alternativa correta antes de o aluno confirmar a resposta.
Responda em português do Brasil, em 2 a 4 frases curtas e limpas (sem markdown pesado).`;

export interface LoadedProfessorSkill {
  content: string;
  sourcePath: string;
  loadedFromFile: boolean;
}

/**
 * Carrega dinamicamente a skill do Professor IREB do arquivo prompts/professor-ireb.skill.md.
 * Como a leitura é feita em tempo de execução, qualquer edição no arquivo já passa a valer
 * imediatamente nas próximas dicas e perguntas sem precisar reiniciar o servidor.
 */
export function loadProfessorSkill(): LoadedProfessorSkill {
  const fullPath = path.join(process.cwd(), SKILL_RELATIVE_PATH);
  try {
    const raw = fs.readFileSync(fullPath, 'utf-8').trim();
    if (raw.length > 0) {
      // Remove frontmatter YAML opcional (--- ... ---) antes de enviar ao modelo
      const withoutFrontmatter = raw.replace(/^---[\s\S]*?---\s*/m, '').trim();
      return {
        content: withoutFrontmatter || raw,
        sourcePath: SKILL_RELATIVE_PATH,
        loadedFromFile: true,
      };
    }
  } catch {
    // Fallback seguro caso o arquivo não exista
  }

  return {
    content: FALLBACK_SKILL_BODY,
    sourcePath: SKILL_RELATIVE_PATH,
    loadedFromFile: false,
  };
}

# Arquitetura e Guia de Manutenção — CPRE Studio (IREB CPRE-FL)

## 1. Visão Geral

O **CPRE Studio** é uma plataforma web full-stack construída em **Next.js 15 (App Router) + React 19 + TypeScript + Tailwind CSS v4 + SQLite (`node:sqlite`)**, alimentada exclusivamente pelas **45 questões reais** do arquivo `data/source/questoes.json`.

## 2. Separação Estrita em Duas Camadas (`data/cpre-studio.db`)

| Camada | Tabelas | Finalidade |
|---|---|---|
| **Camada 1 — Conteúdo Original** | `source_imports`, `questions_source` | Armazena os 10 campos originais do `questoes.json` intactos (`raw_json`, `resposta_correta_json`, `explicacao`, `imagem`, `print`), além do histórico auditável de importações. |
| **Camada 2 — Dados de Aprendizagem** | `topics`, `question_topics`, `question_admin_overrides`, `attempts`, `exam_sessions`, `exam_session_items`, `favorites`, `notes`, `spaced_repetition`, `ai_explanations`, `app_settings` | Armazena todo o progresso do usuário, simulados, anotações, favoritos, revisão espaçada, taxonomia editável e explicações complementares sem nunca modificar a Camada 1. |

## 3. Mapa de Rotas e APIs

### Páginas (Frontend)
- `/` — Visão Geral (Dashboard real, *Continue de onde parou*, *O que estudar agora?*)
- `/estudar` — Modo Estudo (resolução individual, gabarito ocultável, explicação original, Tutor complementar, anotações, favoritos, revisão espaçada)
- `/simulados` — Configurador de simulados, perfis salvos e histórico
- `/simulados/[id]` — Ambiente de prova cronometrado (gabarito e explicação bloqueados no backend e frontend)
- `/simulados/[id]/resultado` — Resultado completo (Resumo + Correção Detalhada)
- `/questoes` — Banco completo com pesquisa e filtros combináveis
- `/revisao` — Revisão de erros (com regra de acertos consecutivos) e Revisão Espaçada
- `/favoritas` — Gestão e sessão de estudo dedicada de favoritas
- `/relatorios` — Relatórios gerais, Mapa de Domínio por assunto, gráficos temporais e relatório por questão
- `/configuracoes` — Importação segura de novas versões do JSON, gestão de imagens, parâmetros e exportação separada

### API Routes (Backend)
- `GET /api/questions` — Lista questões com progresso e filtros
- `GET / PATCH /api/questions/[codigo]` — Detalhe completo / classificação de assunto e sobrescritas administrativas
- `POST / PATCH /api/questions/[codigo]/attempt` — Registra tentativa e atualiza dificuldade da revisão espaçada
- `POST /api/questions/[codigo]/favorite` — Alterna favorita
- `POST / PATCH / DELETE /api/questions/[codigo]/notes` — CRUD de anotações pessoais
- `POST /api/questions/[codigo]/tutor` — Explicação complementar separada (local estruturado ou OpenAI server-side via `OPENAI_API_KEY`)
- `POST /api/questions/[codigo]/image` — Upload de imagem associada à questão
- `GET / POST /api/exams` — Histórico e criação de simulados
- `GET / PATCH /api/exams/[id]` — Carregamento (com gabarito mascarado enquanto `in_progress`) e salvamento de progresso
- `POST /api/exams/[id]/finish` — Finalização e correção do simulado
- `GET /api/dashboard` — Métricas e recomendações reais do dashboard
- `GET /api/reports?period=7|30|90|all` — Relatórios detalhados e mapa de domínio
- `GET / PATCH /api/settings` — Configurações da plataforma e diagnóstico do banco
- `POST /api/import` — Pré-validação (`dryRun: true`) e importação segura de JSON
- `GET /api/export?type=original|history` — Exportação separada da Camada 1 ou Camada 2

## 4. Execução e Testes

```bash
npm install
npm test          # Executa suíte Vitest (importação, correção, integridade, simulados)
npm run typecheck # Verifica tipagem TypeScript estrita
npm run build     # Build de produção Next.js
npm run dev       # Inicia servidor em http://localhost:3045
```

### Variáveis de Ambiente Opcionais (`.env.local`)
- `OPENAI_API_KEY`: ativa geração complementar por LLM no Tutor Inteligente (nunca exposta ao frontend). Sem ela, o Tutor opera normalmente no modo estruturado local.
- `OPENAI_MODEL`: modelo opcional (padrão: `gpt-4o-mini`).
- `CPRE_DB_PATH`: caminho customizado do arquivo SQLite (padrão: `data/cpre-studio.db`).

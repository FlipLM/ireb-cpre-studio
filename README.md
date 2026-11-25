# CPRE Studio — Plataforma de Estudos & RPG Educacional (IREB CPRE-FL)

O **CPRE Studio** é uma plataforma web full-stack (PWA) desenvolvida para preparação intensiva para a certificação **IREB CPRE Foundation Level (CPRE-FL)**. Combina um banco consolidado de **225 questões** comentadas, simulados cronometrados, revisão espaçada, relatórios de domínio por assunto, tutoria com IA fundamentada no Syllabus oficial (RAG) e um módulo completo de **RPG Educacional ("Jornada do Herói")**.

---

## Principais Funcionalidades

### 1. Visão Geral (`/`) — Home do Projeto
- **Carregamento instantâneo (*Stale-While-Revalidate*):** exibe imediatamente a interface e o último snapshot salvo localmente enquanto revalida os dados reais no Supabase em segundo plano.
- **Indicadores reais:** cobertura do banco (`225` questões), taxa geral de acertos, simulados concluídos, tempo de estudo, sequência de dias (*streak*), fila de revisão de erros e favoritas.
- **Continue de onde parou & O que estudar agora?:** recomendações automáticas com base no histórico real de tentativas e assuntos abaixo de 75%.

### 2. Modo Estudo, Banco de Questões e Revisão (`/estudar`, `/questoes`, `/revisao`, `/favoritas`)
- **225 questões oficiais** (única e múltipla escolha) em `data/source/questoes.json` com gabarito e explicação detalhada.
- **Favoritas e anotações pessoais** sincronizadas na nuvem.
- **Revisão de Erros:** mantém questões erradas na fila até atingir a sequência configurada de acertos consecutivos.
- **Revisão Espaçada:** agendamento inteligente de revisão por nível de dificuldade.
- **Tutor IA + RAG:** explicações complementares ancoradas no Syllabus oficial do IREB CPRE-FL (`data/knowledge/ireb-cpre-fl-syllabus.json`).

### 3. Simulados Cronometrados (`/simulados`)
- Configuração personalizada de quantidade de questões, tópicos, tempo e reutilização de respondidas.
- Bloqueio de gabarito e explicações no backend e frontend enquanto a prova está em andamento.
- Tela de resultado completo com resumo estatístico e correção questão a questão.

### 4. Módulo RPG — Jornada do Herói (`/rpg`)
Uma campanha completa de RPG educacional isolada por feature flag (`NEXT_PUBLIC_ENABLE_RPG_MODULE`):
- **4 Regiões temáticas** (*Gruta Esquecida*, *Caverna Assombrada*, *Caverna de Fogo* e *Dungeon de Gelo*), cada uma com mapa DAG de **10 níveis**, bifurcações, eventos narrativos (*Visual Novel*), checkpoints, baús de recompensa e Chefe no nível 10.
- **Combate tático *Local-First* (< 10ms) com sincronização ordenada no Supabase:**
  - **`HERO TURN`:** acertar causa dano (com chance de crítico); errar resulta em **MISS** (sem perda de vida).
  - **`ENEMY TURN`:** cronômetro de defesa com mínimo garantido de **60 segundos (1 minuto)**; acertar bloqueia 100% do ataque inimigo.
  - **Dano proporcional em múltipla escolha:** em questões com 2 ou 3 respostas corretas, acertos parciais dividem proporcionalmente o dano causado ou recebido (ex.: acertar 1 de 2 → `1/2` do dano; acertar 1 de 3 → `2/3` do dano recebido).
  - **Baralho aleatório sem repetição na run:** sorteia aleatoriamente entre todas as 225 questões da base e só permite repetir quando todas forem completadas na mesma campanha.
- **Chefes Discursivos com IA + RAG:** respostas abertas avaliadas semanticamente contra o Syllabus oficial, com cálculo de dano, crítico e *parry*.
- **Progressão e Áudio:** 4 classes de heróis (*Guerreiro*, *Mago*, *Ladino* e *Paladino*), inventário de consumíveis/equipamentos (incluindo itens de eliminação de alternativas erradas) e trilha sonora chiptune sintetizada via Web Audio API.

### 5. Relatórios e Mapa de Domínio (`/relatorios`)
- Análise detalhada de desempenho por assunto do Syllabus, evolução temporal e histórico de simulados com gráficos em Recharts.

---

## Stack Tecnológica

- **Framework:** Next.js 15 (App Router) + React 19 + TypeScript
- **Estilização:** Tailwind CSS v4 + Lucide React
- **Banco de Dados & Auth:** Supabase (PostgreSQL + Row Level Security + `@supabase/ssr`)
- **Validação & Gráficos:** Zod + Recharts
- **IA (Cascata gratuita configurável):** Groq → Cerebras → OpenRouter (`:free`) → Google Gemini
- **Testes:** Vitest
- **Deploy:** Vercel (com Cron de keepalive em `vercel.json`)

---

## Estrutura do Projeto

```text
ireb-cpre-studio/
├── data/
│   ├── source/questoes.json              # Base consolidada com 225 questões IREB CPRE-FL
│   └── knowledge/ireb-cpre-fl-syllabus.json  # Base de conhecimento oficial (RAG)
├── docs/
│   ├── ARQUITETURA.md                    # Arquitetura e mapa de rotas/APIs
│   └── MODULO_RPG.md                     # Documentação técnica da Jornada do Herói
├── public/                               # Ícones PWA, sprites e cenários pixel-art do RPG
├── src/
│   ├── app/                              # Páginas App Router e rotas de API (/api/*)
│   ├── components/                       # Componentes compartilhados e módulo RPG
│   ├── lib/                              # Cloud Store (Supabase), IA, avaliação e engine RPG
│   ├── types/                            # Contratos TypeScript (domínio e RPG)
│   └── middleware.ts                     # Proteção de rotas e sessão Supabase
├── tests/                                # Testes automatizados (Vitest)
└── vercel.json                           # Configuração de Cron Jobs na Vercel
```

---

## Como Rodar Localmente

### 1. Instalar dependências
```bash
npm install
```

### 2. Configurar variáveis de ambiente
Copie `.env.example` para `.env.local` e preencha suas credenciais:

```env
# Supabase (autenticação e banco PostgreSQL na nuvem)
NEXT_PUBLIC_SUPABASE_URL=https://seu-projeto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sua_chave_anon_ou_publishable

# Cascata opcional de IAs (para Tutor, dicas e batalhas contra chefes no RPG)
GROQ_API_KEY=
CEREBRAS_API_KEY=
OPENROUTER_API_KEY=
GEMINI_API_KEY=
GEMINI_MODEL=gemini-3.5-flash-lite
```

### 3. Executar em desenvolvimento
```bash
npm run dev
```
Acesse `http://localhost:3045`.

---

## Scripts Disponíveis

```bash
npm run dev        # Servidor de desenvolvimento (porta 3045)
npm run build      # Build de produção Next.js
npm run start      # Inicia o build de produção (porta 3045)
npm run typecheck  # Verificação estrita de tipos TypeScript (tsc --noEmit)
npm test           # Executa a suíte de testes Vitest
```

---

## Documentação Adicional

- [Arquitetura e Rotas](docs/ARQUITETURA.md)
- [Documentação do Módulo RPG](docs/MODULO_RPG.md)

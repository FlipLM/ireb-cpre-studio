# Módulo RPG — Jornada do Herói (IREB CPRE Studio)

## 1. Visão Geral

O módulo **Jornada do Herói** adiciona ao **IREB CPRE Studio** uma campanha de RPG educacional combinando:
- **Visual Novel:** cenas narrativas com retratos, sprites, diálogos e transições entre regiões.
- **Exploração por Mapa de Nós (estilo *For The King*):** grafos DAG determinísticos de 10 níveis por região, com bifurcações, desafios IREB, eventos aleatórios, eventos *Gap*, baús, checkpoints e chefe no nível 10.
- **Combate Tático por Turnos contra Chefes:** perguntas discursivas avaliadas por IA + RAG oficial do Syllabus IREB CPRE-FL (`ireb_knowledge_base`), com cálculo server-side de dano, crítico, parry, vitória e recuperação segura.

## 2. Independência e Feature Flag

- **Feature Flag:** `NEXT_PUBLIC_ENABLE_RPG_MODULE` (em `src/lib/rpg/feature-flag.ts`).
  - Quando `false` ou `0`, oculta a entrada na navegação (`AppShell.tsx`), bloqueia a página `/rpg` e retorna `404` em todas as rotas `/api/rpg/*`.
- **Isolamento:** todo o código reside em `src/app/rpg/`, `src/app/api/rpg/`, `src/components/rpg/`, `src/lib/rpg/` e `src/types/rpg.ts`, sem modificar tabelas existentes nem duplicar o banco de 225 questões (`data/source/questoes.json`).

## 3. Persistência no Supabase (PostgreSQL + RLS)

Migration aplicada: `create_rpg_jornada_do_heroi` (7 tabelas com RLS `auth.uid() = user_id`):

| Tabela | Responsabilidade |
|---|---|
| `rpg_campaigns` | Estado da campanha, região/nó atual, dicas compartilhadas, ouro, seed, efeitos temporários e diálogos vistos. |
| `rpg_region_maps` | Grafos determinísticos gerados por região e lista de nós concluídos. |
| `rpg_heroes` | Heróis desbloqueados/equipados (máx. 3), nível, XP, pontos de atributo e equipamentos. |
| `rpg_inventory_items` | Mochila de consumíveis, itens de eliminação e equipamentos. |
| `rpg_node_resolutions` | Registro idempotente (`UNIQUE(campaign_id, region_index, node_id)`) que impede duplicação de XP/recompensas. |
| `rpg_boss_battles` | Estado persistido de combates contra chefes. |
| `rpg_boss_turns` | Histórico de turnos discursivos, avaliações estruturadas da IA, danos, críticos e parries. |

## 4. Mapa de Rotas de API (`/api/rpg/*`)

- `GET / PATCH /api/rpg/campaign` — carrega/cria campanha, marca diálogos vistos e alterna regiões desbloqueadas.
- `POST /api/rpg/node/select` — avança para um nó acessível do mapa (questão sem vazar gabarito, evento, baú idempotente, checkpoint ou chefe).
- `POST /api/rpg/challenge/answer` — corrige múltipla escolha server-side com idempotência.
- `POST /api/rpg/challenge/hint` — consome 1 dica compartilhada e gera orientação conceitual via RAG + IA sem spoiler.
- `POST /api/rpg/challenge/eliminate` — consome Lente (-1) ou Prisma (-2) removendo apenas alternativas incorretas.
- `POST /api/rpg/event/resolve` — resolve escolhas de eventos narrativos e eventos *Gap*.
- `POST /api/rpg/checkpoint` — cura grupo (`rest`), gerencia formação de até 3 heróis (`equip_heroes`, restrito a checkpoints) e distribui pontos de atributo (`spend_stat_point`).
- `POST /api/rpg/inventory` — usa consumíveis ou equipa/desequipa itens compatíveis.
- `POST /api/rpg/boss/turn` — avalia resposta discursiva (IA + RAG + fallback), aplica dano/crítico ou contra-ataque/parry e processa vitória/derrota.

## 5. Balanceamento Centralizado

Todos os parâmetros (HP, dano, curva de XP, limites de parry/crítico, frequências de checkpoints, penalidades e raridades) estão centralizados em `src/lib/rpg/balance.ts`.

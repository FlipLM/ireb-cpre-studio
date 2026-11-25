'use client';

import { useEffect, useRef, useState } from 'react';
import { getAvailableNodeIds } from '@/lib/rpg/engine/map-generator';
import { cn } from '@/lib/utils';
import type {
  RpgMapNode,
  RpgNodeType,
  RpgRegionConfig,
  RpgRegionId,
  RpgRegionMapState,
} from '@/types/rpg';

const DESKTOP_VB_W = 1600;
const DESKTOP_VB_H = 800;

const MOBILE_VB_W = 420;
const MOBILE_VB_H = 1280;

const REGION_FLOOR_FX: Record<
  RpgRegionId,
  {
    glowA: string;
    glowB: string;
    sparkleColors: [string, string, string];
    mistColor: string;
    particleMode: 'spore' | 'ember' | 'snow';
  }
> = {
  'gruta-esquecida': {
    glowA: 'rgba(45, 212, 191, 0.09)',
    glowB: 'rgba(139, 92, 246, 0.07)',
    sparkleColors: ['#5eead4', '#6ee7b7', '#c4b5fd'],
    mistColor: 'rgba(15, 118, 110, 0.09)',
    particleMode: 'spore',
  },
  'caverna-assombrada': {
    glowA: 'rgba(139, 92, 246, 0.1)',
    glowB: 'rgba(56, 189, 248, 0.07)',
    sparkleColors: ['#c4b5fd', '#7dd3fc', '#d8b4fe'],
    mistColor: 'rgba(91, 33, 182, 0.1)',
    particleMode: 'spore',
  },
  'caverna-de-fogo': {
    glowA: 'rgba(234, 88, 12, 0.11)',
    glowB: 'rgba(185, 28, 28, 0.08)',
    sparkleColors: ['#fcd34d', '#fb923c', '#f87171'],
    mistColor: 'rgba(154, 52, 18, 0.09)',
    particleMode: 'ember',
  },
  'dungeon-de-gelo': {
    glowA: 'rgba(56, 189, 248, 0.09)',
    glowB: 'rgba(147, 197, 253, 0.07)',
    sparkleColors: ['#bae6fd', '#7dd3fc', '#e0f2fe'],
    mistColor: 'rgba(3, 105, 161, 0.08)',
    particleMode: 'snow',
  },
};

const GLOW_POOLS = [
  { left: 22, top: 28, size: 280, delay: 0 },
  { left: 74, top: 44, size: 300, delay: 2.1 },
  { left: 38, top: 76, size: 280, delay: 4.0 },
];

const CRYSTAL_SPARKLES = [
  { left: 12, top: 18, size: 3, delay: 0.4, dur: 4.8 },
  { left: 39, top: 26, size: 2.5, delay: 2.1, dur: 5.4 },
  { left: 68, top: 16, size: 3, delay: 1.2, dur: 5.8 },
  { left: 24, top: 62, size: 2.5, delay: 3.0, dur: 5.0 },
  { left: 58, top: 54, size: 3, delay: 0.8, dur: 6.2 },
  { left: 84, top: 72, size: 2.5, delay: 2.5, dur: 5.2 },
];

const FLOOR_PARTICLES = [
  { left: 14, top: 80, size: 3, delay: 0.5, dur: 7.8 },
  { left: 28, top: 48, size: 2.5, delay: 2.2, dur: 8.6 },
  { left: 45, top: 74, size: 3, delay: 1.1, dur: 7.4 },
  { left: 61, top: 36, size: 2.5, delay: 3.4, dur: 8.9 },
  { left: 76, top: 68, size: 3, delay: 1.8, dur: 8.1 },
  { left: 88, top: 42, size: 2.5, delay: 0.9, dur: 7.6 },
  { left: 34, top: 90, size: 3, delay: 2.8, dur: 8.4 },
];

/**
 * Piso Pixel-Art contínuo (tileable) natural com animações ambientais sutis:
 * - Textura orgânica de pedra/caverna sem grades ou emendas
 * - Respiração suave de luz ambiente + névoa leve + partículas discretas
 */
function AnimatedCavernFloor({
  region,
  variant,
}: {
  region: RpgRegionConfig;
  variant: 'desktop' | 'mobile';
}) {
  const fx = REGION_FLOOR_FX[region.id];
  const tileSize = variant === 'mobile' ? '360px 360px' : '460px 460px';

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {/* Camada 1: Textura Orgânica Tileable de Piso de Caverna */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: `url(/rpg/maps/${region.id}-tile.jpg)`,
          backgroundRepeat: 'repeat',
          backgroundSize: tileSize,
        }}
      />

      {/* Camada 2: Bolsões sutis de luz ambiente pulsando lentamente no piso */}
      {GLOW_POOLS.map((pool, idx) => (
        <div
          key={`glow-${idx}`}
          className="absolute rounded-full blur-3xl animate-rpg-floor-breathe"
          style={{
            left: `${pool.left}%`,
            top: `${pool.top}%`,
            width: pool.size,
            height: pool.size,
            transform: 'translate(-50%, -50%)',
            background: `radial-gradient(circle, ${idx % 2 === 0 ? fx.glowA : fx.glowB} 0%, transparent 72%)`,
            animationDelay: `${pool.delay}s`,
          }}
        />
      ))}

      {/* Camada 3: Névoa atmosférica muito leve deslizando pelo piso */}
      <div
        className="absolute -inset-x-16 inset-y-0 animate-rpg-mist"
        style={{
          background: `radial-gradient(ellipse at 30% 35%, ${fx.mistColor} 0%, transparent 58%), radial-gradient(ellipse at 72% 70%, ${fx.mistColor} 0%, transparent 58%)`,
        }}
      />

      {/* Camada 4: Brilhos discretos e naturais nos cristais do chão */}
      {CRYSTAL_SPARKLES.map((s, idx) => {
        const color = fx.sparkleColors[idx % fx.sparkleColors.length];
        return (
          <span
            key={`spark-${idx}`}
            className="absolute rounded-full animate-rpg-crystal-twinkle"
            style={{
              left: `${s.left}%`,
              top: `${s.top}%`,
              width: s.size,
              height: s.size,
              backgroundColor: color,
              boxShadow: `0 0 5px 1px ${color}`,
              animationDelay: `${s.delay}s`,
              animationDuration: `${s.dur}s`,
            }}
          />
        );
      })}

      {/* Camada 5: Poeira / Esporos / Brasas / Flocos sutis flutuando */}
      {FLOOR_PARTICLES.map((p, idx) => {
        const color = fx.sparkleColors[(idx + 1) % fx.sparkleColors.length];
        const animClass =
          fx.particleMode === 'snow'
            ? 'animate-rpg-snow'
            : fx.particleMode === 'ember'
              ? 'animate-rpg-ember'
              : 'animate-rpg-spore';
        return (
          <span
            key={`part-${idx}`}
            className={cn('absolute rounded-full opacity-60', animClass)}
            style={{
              left: `${p.left}%`,
              top: fx.particleMode === 'snow' ? `${(idx * 10) % 60}%` : `${p.top}%`,
              width: p.size,
              height: p.size,
              backgroundColor: color,
              boxShadow: `0 0 4px ${color}`,
              animationDelay: `${p.delay}s`,
              animationDuration: `${p.dur}s`,
            }}
          />
        );
      })}

      {/* Camada 6: Vinheta natural de caverna para dar profundidade */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(circle at 50% 50%, rgba(8, 7, 12, 0.12) 0%, rgba(8, 7, 12, 0.36) 68%, rgba(6, 5, 10, 0.72) 100%)',
        }}
      />
    </div>
  );
}

/**
 * Posicionamento horizontal (Desktop) em percentual (0..100%) ocupando 100% da tela.
 */
function getDesktopNodePos(node: RpgMapNode): { xPct: number; yPct: number } {
  const xBase = 6.5 + node.column * 9.6;
  const xJitter = node.lane === 1 ? 0.9 : node.lane === 2 ? -0.7 : 0;
  const xPct = Math.min(93.5, Math.max(5.5, xBase + xJitter));

  const spineY = [50, 45, 53, 47, 50, 46, 54, 48, 52, 50][node.column] ?? 50;
  const isSingle = node.column === 0 || node.column === 4 || node.column === 7 || node.column === 9;
  const spread = isSingle ? 0 : 25;

  const yPct =
    node.lane === 0
      ? spineY - spread
      : node.lane === 2
        ? spineY + spread
        : spineY + (node.column % 2 === 0 ? -2.5 : 3);

  return { xPct, yPct };
}

/**
 * Posicionamento vertical (Mobile) subindo da base (Entrada = 93%) até o topo (Chefe = 7%),
 * com amplo espaçamento entre colunas e faixas para zero sobreposição no toque.
 */
function getMobileNodePos(node: RpgMapNode): { xPct: number; yPct: number } {
  const yBase = 93 - node.column * 9.55;
  const yJitter = node.lane === 0 ? -0.9 : node.lane === 2 ? 0.9 : 0;
  const yPct = Math.min(94.5, Math.max(6.5, yBase + yJitter));

  const isSingle = node.column === 0 || node.column === 4 || node.column === 7 || node.column === 9;
  if (isSingle) {
    return { xPct: 50, yPct };
  }

  const wave = node.column % 2 === 0 ? 2 : -2;
  const xPct = node.lane === 0 ? 20 + wave : node.lane === 2 ? 80 + wave : 50 - wave;

  return { xPct, yPct };
}

function getNodeIconSrc(type: RpgNodeType, completed: boolean, locked: boolean): string {
  if (locked) return '/rpg/map/locked.png';
  if (completed && type !== 'checkpoint' && type !== 'boss') return '/rpg/map/completed.png';
  return `/rpg/map/${type}.png`;
}

export function RegionMapCanvas({
  region,
  regionMap,
  currentNodeId,
  onSelectNode,
  disabled,
}: {
  region: RpgRegionConfig;
  regionMap: RpgRegionMapState;
  currentNodeId: string;
  onSelectNode: (node: RpgMapNode) => void;
  disabled?: boolean;
}) {
  const { graph, completedNodeIds } = regionMap;
  const completedSet = new Set(completedNodeIds);
  const availableSet = new Set(getAvailableNodeIds(graph, completedNodeIds));
  const nodeById = new Map(graph.nodes.map((n) => [n.id, n]));
  const [hoveredNode, setHoveredNode] = useState<RpgMapNode | null>(null);
  const mobileCurrentRef = useRef<HTMLDivElement | null>(null);

  // No mobile, centraliza suavemente a câmera vertical no nó atual ao carregar/avançar
  useEffect(() => {
    const el = mobileCurrentRef.current;
    if (!el) return;
    const timer = window.setTimeout(() => {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 120);
    return () => window.clearTimeout(timer);
  }, [currentNodeId, region.id]);

  return (
    <div className="relative w-full h-full overflow-hidden bg-[#0b0910] select-none">
      {/* =====================================================================
          VERSÃO DESKTOP (md+): Mapa Horizontal sobre Piso de Caverna Animado
      ===================================================================== */}
      <div className="hidden md:block relative w-full h-full overflow-hidden">
        <AnimatedCavernFloor region={region} variant="desktop" />

        {/* Título da Região no canto superior esquerdo */}
        <div className="absolute top-4 left-5 z-20 px-4 py-2 rounded-xl bg-[#141018]/90 border-2 border-[#c9974b]/80 backdrop-blur-xs shadow-xl pointer-events-none">
          <div className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-[#f7dc94]">
            Região {region.index + 1} • Níveis {region.levelRange[0]}–{region.levelRange[1]}
          </div>
          <div className="text-base sm:text-lg font-extrabold text-amber-50 leading-tight">
            {region.name}
          </div>
        </div>

        {/* Tooltip contextual no canto inferior esquerdo */}
        {hoveredNode && (
          <div className="absolute bottom-4 left-5 z-20 px-4 py-2.5 rounded-xl bg-[#141018]/95 border-2 border-[#f5c451] backdrop-blur-xs shadow-2xl pointer-events-none animate-card-enter max-w-md">
            <div className="text-sm font-extrabold text-[#fde68a]">
              Nível {hoveredNode.globalLevel} — {hoveredNode.label}
            </div>
            <div className="text-xs text-[#e2d4c6] mt-0.5">
              {hoveredNode.type === 'boss'
                ? 'Chefe da Região — Combate discursivo por turnos avaliado por IA + Syllabus'
                : hoveredNode.type === 'checkpoint'
                  ? 'Acampamento: cure 100% do grupo, troque heróis equipados e distribua pontos de nível'
                  : hoveredNode.type === 'special'
                    ? 'Provação de Elite — Inimigos mais fortes com recompensa de Baú Dourado'
                    : hoveredNode.type === 'question'
                      ? 'Batalha de Conhecimento — Derrote todos os inimigos para abrir um Baú de Prêmio'
                      : 'Evento Narrativo — Escolhas estratégicas com risco e recompensa'}
            </div>
          </div>
        )}

        {/* Trilhas pontilhadas SVG Desktop */}
        <svg
          viewBox={`0 0 ${DESKTOP_VB_W} ${DESKTOP_VB_H}`}
          preserveAspectRatio="none"
          className="absolute inset-0 w-full h-full pointer-events-none z-10"
        >
          {graph.nodes.flatMap((node) =>
            node.nextIds.map((nextId) => {
              const target = nodeById.get(nextId);
              if (!target) return null;
              const p1 = getDesktopNodePos(node);
              const p2 = getDesktopNodePos(target);
              const x1 = (p1.xPct / 100) * DESKTOP_VB_W;
              const y1 = (p1.yPct / 100) * DESKTOP_VB_H;
              const x2 = (p2.xPct / 100) * DESKTOP_VB_W;
              const y2 = (p2.yPct / 100) * DESKTOP_VB_H;
              const midX = (x1 + x2) / 2;
              const midY = (y1 + y2) / 2 + (node.lane === 0 ? -24 : node.lane === 2 ? 24 : 0);

              const isDoneEdge = completedSet.has(node.id) && completedSet.has(target.id);
              const isAvailableEdge = completedSet.has(node.id) && availableSet.has(target.id);

              return (
                <path
                  key={`${node.id}->${target.id}`}
                  d={`M ${x1} ${y1} Q ${midX} ${midY} ${x2} ${y2}`}
                  fill="none"
                  stroke={
                    isDoneEdge
                      ? '#4ade80'
                      : isAvailableEdge
                        ? '#fde047'
                        : 'rgba(241, 245, 249, 0.78)'
                  }
                  strokeWidth={isAvailableEdge ? 7 : isDoneEdge ? 6 : 4.5}
                  strokeLinecap="round"
                  strokeDasharray="1 16"
                  className={isAvailableEdge ? 'animate-rpg-dash' : undefined}
                />
              );
            })
          )}
        </svg>

        {/* Nós Hexagonais Desktop */}
        {graph.nodes.map((node) => {
          const pos = getDesktopNodePos(node);
          const isCompleted = completedSet.has(node.id);
          const isAvailable = availableSet.has(node.id);
          const isCurrent = currentNodeId === node.id;
          const isCheckpointReusable = node.type === 'checkpoint' && isCompleted;
          const isClickable = !disabled && (isAvailable || isCheckpointReusable);
          const isLocked = !isCompleted && !isAvailable;
          const isBoss = node.type === 'boss';
          const sizePx = isBoss ? 84 : 64;
          const iconSrc = getNodeIconSrc(node.type, isCompleted, isLocked);

          return (
            <div
              key={node.id}
              className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center z-20"
              style={{ left: `${pos.xPct}%`, top: `${pos.yPct}%` }}
            >
              {isCurrent && (
                <div
                  className="pointer-events-none absolute left-1/2 top-1/2 w-36 h-36 rounded-full blur-2xl animate-rpg-torch -z-10"
                  style={{
                    background:
                      'radial-gradient(circle, rgba(245, 196, 81, 0.45) 0%, transparent 70%)',
                  }}
                />
              )}

              {isCurrent && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src="/rpg/map/current.png"
                  alt="Você está aqui"
                  className="w-9 h-9 rpg-pixel absolute -top-9 z-30 animate-rpg-bob drop-shadow-[0_4px_10px_rgba(0,0,0,0.95)]"
                />
              )}

              <button
                type="button"
                disabled={!isClickable}
                onMouseEnter={() => setHoveredNode(node)}
                onMouseLeave={() => setHoveredNode((prev) => (prev?.id === node.id ? null : prev))}
                onClick={() => isClickable && onSelectNode(node)}
                style={{ width: sizePx, height: sizePx }}
                className={cn(
                  'rpg-hex flex items-center justify-center transition-all relative p-[3.5px]',
                  isClickable && 'cursor-pointer hover:scale-115 active:scale-95',
                  !isClickable && 'cursor-default',
                  isAvailable && 'bg-[#f5c451] shadow-[0_0_28px_rgba(245,196,81,0.9)]',
                  isCompleted && node.type !== 'checkpoint' && 'bg-emerald-400',
                  node.type === 'checkpoint' && (isCompleted || isAvailable) && 'bg-sky-400',
                  isBoss && isAvailable && 'bg-rose-500 shadow-[0_0_36px_rgba(244,63,94,0.95)]',
                  isLocked && 'bg-slate-500/85 opacity-85'
                )}
              >
                <span
                  className={cn(
                    'rpg-hex w-full h-full flex items-center justify-center p-2.5',
                    isAvailable
                      ? 'bg-[#261c16]'
                      : isCompleted
                        ? 'bg-[#12261b]'
                        : 'bg-[#161822]'
                  )}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={iconSrc}
                    alt={node.label}
                    className={cn(
                      'w-full h-full object-contain rpg-pixel',
                      isAvailable && 'animate-rpg-bob'
                    )}
                  />
                </span>
              </button>

              {(isAvailable || isBoss || node.type === 'checkpoint') && (
                <span
                  className={cn(
                    'mt-1 text-xs font-extrabold whitespace-nowrap px-2.5 py-0.5 rounded-md bg-[#120e16]/95 border shadow-lg',
                    isAvailable
                      ? 'border-[#f5c451] text-[#fde68a]'
                      : isBoss
                        ? 'border-rose-400 text-rose-200'
                        : 'border-sky-400 text-sky-200'
                  )}
                >
                  {node.label}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* =====================================================================
          VERSÃO MOBILE (< md): Árvore Vertical sobre Piso de Caverna Animado
      ===================================================================== */}
      <div className="md:hidden relative w-full h-full overflow-y-auto overflow-x-hidden scroll-smooth">
        {/* Banner flutuante compacto da região no topo */}
        <div className="sticky top-2.5 z-30 flex justify-center px-3 pointer-events-none">
          <div className="px-3.5 py-1.5 rounded-full bg-[#141018]/90 border border-[#c9974b]/85 backdrop-blur-xs shadow-xl flex items-center gap-2">
            <span className="text-[10px] font-black uppercase tracking-[0.16em] text-[#f5c451]">
              Região {region.index + 1}
            </span>
            <span className="text-[#8f6b47]">•</span>
            <span className="text-xs font-extrabold text-amber-50">{region.name}</span>
            <span className="text-[10px] font-bold text-[#c9b29b]">
              (Nv.{region.levelRange[0]}–{region.levelRange[1]})
            </span>
          </div>
        </div>

        {/* Canvas Vertical Alto (1280px) subindo da base (Entrada) até o topo (Chefe) */}
        <div className="relative w-full -mt-9" style={{ height: MOBILE_VB_H }}>
          <AnimatedCavernFloor region={region} variant="mobile" />

          {/* Trilhas pontilhadas SVG Verticais */}
          <svg
            viewBox={`0 0 ${MOBILE_VB_W} ${MOBILE_VB_H}`}
            preserveAspectRatio="none"
            className="absolute inset-0 w-full h-full pointer-events-none z-10"
          >
            {graph.nodes.flatMap((node) =>
              node.nextIds.map((nextId) => {
                const target = nodeById.get(nextId);
                if (!target) return null;
                const p1 = getMobileNodePos(node);
                const p2 = getMobileNodePos(target);
                const x1 = (p1.xPct / 100) * MOBILE_VB_W;
                const y1 = (p1.yPct / 100) * MOBILE_VB_H;
                const x2 = (p2.xPct / 100) * MOBILE_VB_W;
                const y2 = (p2.yPct / 100) * MOBILE_VB_H;
                const midX = (x1 + x2) / 2 + (node.lane === 0 ? -16 : node.lane === 2 ? 16 : 0);
                const midY = (y1 + y2) / 2;

                const isDoneEdge = completedSet.has(node.id) && completedSet.has(target.id);
                const isAvailableEdge = completedSet.has(node.id) && availableSet.has(target.id);

                return (
                  <path
                    key={`m-${node.id}->${target.id}`}
                    d={`M ${x1} ${y1} Q ${midX} ${midY} ${x2} ${y2}`}
                    fill="none"
                    stroke={
                      isDoneEdge
                        ? '#4ade80'
                        : isAvailableEdge
                          ? '#fde047'
                          : 'rgba(241, 245, 249, 0.72)'
                    }
                    strokeWidth={isAvailableEdge ? 5.5 : isDoneEdge ? 4.5 : 3.5}
                    strokeLinecap="round"
                    strokeDasharray="1 13"
                    className={isAvailableEdge ? 'animate-rpg-dash' : undefined}
                  />
                );
              })
            )}
          </svg>

          {/* Nós Hexagonais Verticais com Amplo Espaçamento para Toque */}
          {graph.nodes.map((node) => {
            const pos = getMobileNodePos(node);
            const isCompleted = completedSet.has(node.id);
            const isAvailable = availableSet.has(node.id);
            const isCurrent = currentNodeId === node.id;
            const isCheckpointReusable = node.type === 'checkpoint' && isCompleted;
            const isClickable = !disabled && (isAvailable || isCheckpointReusable);
            const isLocked = !isCompleted && !isAvailable;
            const isBoss = node.type === 'boss';
            const sizePx = isBoss ? 76 : 58;
            const iconSrc = getNodeIconSrc(node.type, isCompleted, isLocked);

            return (
              <div
                key={`m-${node.id}`}
                ref={isCurrent ? mobileCurrentRef : undefined}
                className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center z-20"
                style={{ left: `${pos.xPct}%`, top: `${pos.yPct}%` }}
              >
                {isCurrent && (
                  <div
                    className="pointer-events-none absolute left-1/2 top-1/2 w-28 h-28 rounded-full blur-2xl animate-rpg-torch -z-10"
                    style={{
                      background:
                        'radial-gradient(circle, rgba(245, 196, 81, 0.45) 0%, transparent 70%)',
                    }}
                  />
                )}

                {isCurrent && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src="/rpg/map/current.png"
                    alt="Você está aqui"
                    className="w-8 h-8 rpg-pixel absolute -top-8 z-30 animate-rpg-bob drop-shadow-[0_4px_10px_rgba(0,0,0,0.95)]"
                  />
                )}

                <button
                  type="button"
                  disabled={!isClickable}
                  onClick={() => isClickable && onSelectNode(node)}
                  style={{ width: sizePx, height: sizePx }}
                  className={cn(
                    'rpg-hex flex items-center justify-center transition-all relative p-[3px]',
                    isClickable && 'cursor-pointer active:scale-90',
                    !isClickable && 'cursor-default',
                    isAvailable && 'bg-[#f5c451] shadow-[0_0_24px_rgba(245,196,81,0.9)]',
                    isCompleted && node.type !== 'checkpoint' && 'bg-emerald-400',
                    node.type === 'checkpoint' && (isCompleted || isAvailable) && 'bg-sky-400',
                    isBoss && isAvailable && 'bg-rose-500 shadow-[0_0_32px_rgba(244,63,94,0.95)]',
                    isLocked && 'bg-slate-500/85 opacity-85'
                  )}
                >
                  <span
                    className={cn(
                      'rpg-hex w-full h-full flex items-center justify-center p-2',
                      isAvailable
                        ? 'bg-[#261c16]'
                        : isCompleted
                          ? 'bg-[#12261b]'
                          : 'bg-[#161822]'
                    )}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={iconSrc}
                      alt={node.label}
                      className={cn(
                        'w-full h-full object-contain rpg-pixel',
                        isAvailable && 'animate-rpg-bob'
                      )}
                    />
                  </span>
                </button>

                {(isAvailable || isBoss || node.type === 'checkpoint' || isCurrent) && (
                  <span
                    className={cn(
                      'mt-1 text-[10px] font-extrabold whitespace-nowrap px-2 py-0.5 rounded-md bg-[#120e16]/95 border shadow-lg',
                      isAvailable
                        ? 'border-[#f5c451] text-[#fde68a]'
                        : isBoss
                          ? 'border-rose-400 text-rose-200'
                          : node.type === 'checkpoint'
                            ? 'border-sky-400 text-sky-200'
                            : 'border-emerald-400/80 text-emerald-200'
                    )}
                  >
                    {node.label}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

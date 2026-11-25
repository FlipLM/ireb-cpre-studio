'use client';

import { cn } from '@/lib/utils';
import type { RpgHeroClassId, RpgRegionConfig } from '@/types/rpg';

export type SpriteAnimState = 'idle' | 'attack' | 'hit' | 'parry' | 'victory' | 'defeat';
export type RpgVfxType = 'slash' | 'crit' | 'parry' | 'fire' | 'ice' | 'heal' | 'dark';

const PARTICLES = [
  { left: 8, top: 72, size: 5, delay: 0.2, dur: 4.2 },
  { left: 19, top: 48, size: 4, delay: 1.1, dur: 5.1 },
  { left: 31, top: 82, size: 6, delay: 0.7, dur: 4.8 },
  { left: 46, top: 64, size: 4, delay: 1.9, dur: 4.5 },
  { left: 61, top: 78, size: 5, delay: 0.4, dur: 5.3 },
  { left: 74, top: 52, size: 6, delay: 1.5, dur: 4.4 },
  { left: 86, top: 76, size: 5, delay: 0.9, dur: 4.9 },
  { left: 93, top: 38, size: 4, delay: 2.2, dur: 5.5 },
];

/**
 * Cenário pixel art real do dataset por região, com vinheta cinematográfica
 * e partículas ambientais leves coerentes com cada bioma.
 */
export function RegionBackdrop({
  region,
  className,
}: {
  region: RpgRegionConfig;
  className?: string;
}) {
  const { theme, id } = region;
  const isSnow = theme.particleType === 'snow';

  return (
    <div
      className={cn('pointer-events-none fixed inset-0 z-0 overflow-hidden bg-[#120d0c]', className)}
      aria-hidden="true"
    >
      {/* Imagem pixel art da região ocupando 100% da viewport */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`/rpg/backgrounds/${id}.jpg`}
        alt=""
        className="w-full h-full object-cover rpg-pixel opacity-75 scale-[1.03] transition-opacity duration-700"
      />

      {/* Vinheta atmosférica escura para máxima legibilidade dos painéis RPG */}
      <div
        className="absolute inset-0"
        style={{
          background: `radial-gradient(circle at 50% 24%, ${theme.ambientTint}, rgba(14, 10, 9, 0.72) 68%, rgba(10, 7, 7, 0.92) 100%)`,
        }}
      />

      {/* Partículas ambientais animadas */}
      <div className="absolute inset-0">
        {PARTICLES.map((p, idx) => (
          <span
            key={idx}
            className={cn(
              'absolute rounded-full',
              isSnow ? 'animate-rpg-snow' : 'animate-rpg-ember'
            )}
            style={{
              left: `${p.left}%`,
              top: isSnow ? `${(idx * 9) % 35}%` : `${p.top}%`,
              width: `${p.size}px`,
              height: `${p.size}px`,
              backgroundColor: theme.primary,
              boxShadow: `0 0 10px ${theme.primary}`,
              animationDelay: `${p.delay}s`,
              animationDuration: `${p.dur}s`,
            }}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * Sprite pixel art real do herói (sem movimentação livre — apenas animações pontuais).
 */
export function HeroSprite({
  heroClassId,
  anim = 'idle',
  size = 96,
  className,
}: {
  heroClassId: RpgHeroClassId;
  anim?: SpriteAnimState;
  size?: number;
  className?: string;
}) {
  const animCls =
    anim === 'idle'
      ? 'animate-rpg-bob'
      : anim === 'attack'
        ? 'animate-rpg-attack-right'
        : anim === 'hit'
          ? 'animate-rpg-hit'
          : anim === 'parry'
            ? 'animate-rpg-parry'
            : anim === 'victory'
              ? '-translate-y-2 scale-110 transition-transform duration-300'
              : 'opacity-40 grayscale translate-y-2 transition-all duration-300';

  return (
    <div
      className={cn('inline-flex items-center justify-center relative shrink-0', animCls, className)}
      style={{ width: size, height: size }}
    >
      {/* Sombra no chão */}
      <span className="absolute bottom-1 w-3/4 h-2.5 rounded-full bg-black/55 blur-[2px]" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`/rpg/heroes/${heroClassId}.png`}
        alt={heroClassId}
        className="w-full h-full object-contain rpg-pixel relative z-10 drop-shadow-[0_6px_12px_rgba(0,0,0,0.65)]"
      />
    </div>
  );
}

/**
 * Sprite pixel art real do Chefe da região com aura e animações pontuais de combate.
 */
export function BossSprite({
  bossId,
  anim = 'idle',
  size = 164,
  className,
}: {
  bossId: string;
  anim?: SpriteAnimState;
  size?: number;
  className?: string;
}) {
  const animCls =
    anim === 'idle'
      ? 'animate-rpg-boss-hover'
      : anim === 'attack'
        ? 'animate-rpg-attack-left'
        : anim === 'hit'
          ? 'animate-rpg-hit'
          : anim === 'defeat'
            ? 'opacity-25 grayscale scale-90 translate-y-4 transition-all duration-500'
            : 'animate-rpg-boss-hover';

  return (
    <div
      className={cn('inline-flex items-center justify-center relative shrink-0', animCls, className)}
      style={{ width: size, height: size }}
    >
      <span className="absolute bottom-1 w-4/5 h-4 rounded-full bg-black/60 blur-[3px]" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`/rpg/bosses/${bossId}.png`}
        alt={bossId}
        className="w-full h-full object-contain rpg-pixel relative z-10 drop-shadow-[0_12px_22px_rgba(0,0,0,0.75)]"
      />
    </div>
  );
}

/**
 * Ícone pixel art real de item do inventário.
 */
export function ItemIcon({
  itemId,
  size = 44,
  className,
}: {
  itemId: string;
  size?: number;
  className?: string;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/rpg/items/${itemId}.png`}
      alt={itemId}
      style={{ width: size, height: size }}
      className={cn('object-contain rpg-pixel shrink-0 drop-shadow-[0_4px_8px_rgba(0,0,0,0.5)]', className)}
    />
  );
}

/**
 * Efeito Visual (VFX) pixel art pontual sobreposto durante ataques, críticos, parries e curas.
 */
export function VfxBurst({
  type,
  triggerKey,
  size = 112,
}: {
  type: RpgVfxType;
  triggerKey: number;
  size?: number;
}) {
  if (triggerKey <= 0) return null;
  return (
    <div
      key={triggerKey}
      className="pointer-events-none absolute inset-0 flex items-center justify-center z-30"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`/rpg/vfx/${type}.png`}
        alt=""
        style={{ width: size, height: size }}
        className="object-contain rpg-pixel animate-rpg-vfx drop-shadow-[0_0_16px_rgba(255,215,90,0.8)]"
      />
    </div>
  );
}

/**
 * Retrato pixel art na caixa de diálogo Visual Novel.
 */
export function PortraitAvatar({ portraitId }: { portraitId: string }) {
  const isProf = portraitId === 'professor';
  const classIds: RpgHeroClassId[] = ['warrior', 'mage', 'rogue', 'paladin'];
  const isHero = classIds.includes(portraitId as RpgHeroClassId);

  return (
    <div className="w-22 h-22 sm:w-26 sm:h-26 rounded-2xl border-2 border-[#d4a24c] bg-[#18110f] p-1.5 flex items-center justify-center shrink-0 shadow-[inset_0_0_18px_rgba(0,0,0,0.85)]">
      {isProf ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src="/icons/icon-192.png"
          alt="Prof. IREB"
          className="w-full h-full object-contain rpg-pixel"
        />
      ) : isHero ? (
        <HeroSprite heroClassId={portraitId as RpgHeroClassId} size={82} />
      ) : (
        <BossSprite bossId={portraitId} size={82} />
      )}
    </div>
  );
}

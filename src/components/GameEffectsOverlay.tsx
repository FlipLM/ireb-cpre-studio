'use client';

import { useEffect, useRef } from 'react';
import { Flame, Sparkles, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  rotation: number;
  vRot: number;
  alpha: number;
  shape: 'rect' | 'circle';
}

const COLORS = ['#4f46e5', '#10b981', '#f59e0b', '#0ea5e9', '#ec4899', '#8b5cf6'];

export interface FloatingFeedback {
  id: number;
  type: 'correct' | 'combo' | 'wrong';
  title: string;
  subtitle?: string;
}

interface GameEffectsOverlayProps {
  confettiTrigger: number;
  confettiIntensity?: 'normal' | 'big';
  feedback: FloatingFeedback | null;
}

export function GameEffectsOverlay({
  confettiTrigger,
  confettiIntensity = 'normal',
  feedback,
}: GameEffectsOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const particlesRef = useRef<Particle[]>([]);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (confettiTrigger === 0) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const count = confettiIntensity === 'big' ? 110 : 48;
    const originX = window.innerWidth * 0.5;
    const originY = confettiIntensity === 'big' ? window.innerHeight * 0.28 : window.innerHeight * 0.42;

    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * Math.random()) - Math.PI / 2;
      const speed = (confettiIntensity === 'big' ? 5 : 3.5) + Math.random() * 8;
      particlesRef.current.push({
        x: originX + (Math.random() - 0.5) * 140,
        y: originY + (Math.random() - 0.5) * 40,
        vx: Math.cos(angle) * speed * (0.8 + Math.random() * 0.6),
        vy: Math.sin(angle) * speed - (confettiIntensity === 'big' ? 5.5 : 4.2),
        size: 5 + Math.random() * 6,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        rotation: Math.random() * Math.PI * 2,
        vRot: (Math.random() - 0.5) * 0.28,
        alpha: 1,
        shape: Math.random() > 0.35 ? 'rect' : 'circle',
      });
    }

    const render = () => {
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      particlesRef.current = particlesRef.current.filter((p) => p.alpha > 0.03);
      for (const p of particlesRef.current) {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.24; // gravidade suave
        p.vx *= 0.99;
        p.rotation += p.vRot;
        p.alpha -= 0.011;

        ctx.save();
        ctx.globalAlpha = Math.max(0, p.alpha);
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        ctx.fillStyle = p.color;
        if (p.shape === 'rect') {
          ctx.fillRect(-p.size / 2, -p.size / 3, p.size, p.size * 0.6);
        } else {
          ctx.beginPath();
          ctx.arc(0, 0, p.size / 2.4, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }

      if (particlesRef.current.length > 0) {
        rafRef.current = window.requestAnimationFrame(render);
      } else {
        rafRef.current = null;
      }
    };

    if (!rafRef.current) {
      rafRef.current = window.requestAnimationFrame(render);
    }

    return () => {
      // deixa partículas terminarem suavemente
    };
  }, [confettiTrigger, confettiIntensity]);

  useEffect(() => {
    return () => {
      if (rafRef.current) window.cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return (
    <>
      <canvas
        ref={canvasRef}
        className="pointer-events-none fixed inset-0 z-50"
        aria-hidden="true"
      />

      {feedback && (
        <div
          key={feedback.id}
          className="pointer-events-none fixed left-1/2 top-24 z-50 animate-float-up"
          aria-live="polite"
        >
          <div
            className={cn(
              'flex items-center gap-2.5 px-5 py-2.5 rounded-2xl shadow-xl border backdrop-blur-md',
              feedback.type === 'combo'
                ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white border-indigo-400/50'
                : feedback.type === 'correct'
                  ? 'bg-emerald-600 text-white border-emerald-400/50'
                  : 'bg-rose-600 text-white border-rose-400/50'
            )}
          >
            {feedback.type === 'combo' ? (
              <Flame className="w-5 h-5 text-amber-300 fill-amber-300 shrink-0" />
            ) : feedback.type === 'correct' ? (
              <Sparkles className="w-5 h-5 text-emerald-200 shrink-0" />
            ) : (
              <XCircle className="w-5 h-5 text-rose-200 shrink-0" />
            )}
            <div className="leading-tight">
              <div className="text-sm font-bold tracking-tight">{feedback.title}</div>
              {feedback.subtitle && (
                <div className="text-[11px] opacity-90 font-medium">{feedback.subtitle}</div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

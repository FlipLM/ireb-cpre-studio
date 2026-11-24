'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Eye,
  EyeOff,
  Lightbulb,
  Loader2,
  Maximize2,
  MessageCircleQuestion,
  Minimize2,
  RotateCcw,
  Send,
  Sparkles,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export type ProfessorMood = 'idle' | 'talking' | 'thinking' | 'angry_slam' | 'celebrate_clap';
export type ProfessorSize = 'sm' | 'md' | 'lg' | 'xl';

interface ProfessorCompanionProps {
  mood: ProfessorMood;
  message: string;
  badge?: string;
  speakerName?: string;
  className?: string;
  /** Quando informado, ativa os botões de IA (Pedir dica / Fazer pergunta) para a questão atual */
  questionCodigo?: string;
  /** Informa à IA se o aluno já confirmou a resposta (evita spoilers antes de responder) */
  alreadySubmitted?: boolean;
}

interface ChatTurn {
  role: 'user' | 'model';
  text: string;
}

const SIZE_STORAGE_KEY = 'ireb_professor_size';
const MOBILE_POS_STORAGE_KEY = 'ireb_professor_mobile_pos';
const MOBILE_SIZE_STORAGE_KEY = 'ireb_professor_mobile_size';
const MOBILE_MIN_SIZE = 56;
const MOBILE_MAX_SIZE = 180;
const MOBILE_DEFAULT_SIZE = 88;

const SIZE_CONFIG: Record<
  ProfessorSize,
  { label: string; title: string; boxClass: string; spriteClass: string }
> = {
  sm: {
    label: 'P',
    title: 'Pequeno',
    boxClass: 'w-24 h-24 sm:w-28 sm:h-28',
    spriteClass: 'w-24 h-24 sm:w-28 sm:h-28',
  },
  md: {
    label: 'M',
    title: 'Médio',
    boxClass: 'w-32 h-32 sm:w-36 sm:h-36',
    spriteClass: 'w-32 h-32 sm:w-36 sm:h-36',
  },
  lg: {
    label: 'G',
    title: 'Grande',
    boxClass: 'w-40 h-40 sm:w-48 sm:h-48',
    spriteClass: 'w-40 h-40 sm:w-48 sm:h-48',
  },
  xl: {
    label: 'GG',
    title: 'Extra grande',
    boxClass: 'w-48 h-48 sm:w-60 sm:h-60',
    spriteClass: 'w-48 h-48 sm:w-60 sm:h-60',
  },
};

const SPRITE_CONFIG: Record<
  ProfessorMood,
  { src: string; frames: number; fps: number }
> = {
  idle: {
    src: '/sprites/professor/professor-idle-sheet-512px.png',
    frames: 4,
    fps: 3,
  },
  talking: {
    src: '/sprites/professor/professor-talking-sheet-512px.png',
    frames: 4,
    fps: 7,
  },
  thinking: {
    src: '/sprites/professor/professor-thinking-sheet-512px.png',
    frames: 4,
    fps: 3,
  },
  angry_slam: {
    src: '/sprites/professor/professor-angry_slam-sheet-512px.png',
    frames: 6,
    fps: 8,
  },
  celebrate_clap: {
    src: '/sprites/professor/professor-celebrate_clap-sheet-512px.png',
    frames: 4,
    fps: 6,
  },
};

type BubbleTone = 'default' | 'hint' | 'ask' | 'thinking';

const ORDERED_ITEM_ACCENTS = [
  {
    card: 'border-indigo-200/80 border-l-indigo-500 bg-gradient-to-r from-indigo-50/55 via-white to-white',
    badge: 'bg-indigo-600 text-white shadow-xs',
    title: 'text-indigo-900',
  },
  {
    card: 'border-sky-200/80 border-l-sky-500 bg-gradient-to-r from-sky-50/55 via-white to-white',
    badge: 'bg-sky-600 text-white shadow-xs',
    title: 'text-sky-900',
  },
  {
    card: 'border-emerald-200/80 border-l-emerald-500 bg-gradient-to-r from-emerald-50/55 via-white to-white',
    badge: 'bg-emerald-600 text-white shadow-xs',
    title: 'text-emerald-900',
  },
  {
    card: 'border-violet-200/80 border-l-violet-500 bg-gradient-to-r from-violet-50/55 via-white to-white',
    badge: 'bg-violet-600 text-white shadow-xs',
    title: 'text-violet-900',
  },
  {
    card: 'border-amber-200/80 border-l-amber-500 bg-gradient-to-r from-amber-50/60 via-white to-white',
    badge: 'bg-amber-500 text-white shadow-xs',
    title: 'text-amber-900',
  },
  {
    card: 'border-teal-200/80 border-l-teal-500 bg-gradient-to-r from-teal-50/55 via-white to-white',
    badge: 'bg-teal-600 text-white shadow-xs',
    title: 'text-teal-900',
  },
];

/**
 * Renderiza inline **negrito**, *itálico* e `termo` com destaques coloridos intuitivos.
 * Também trata texto parcial durante o efeito typewriter de forma limpa.
 */
function renderInlineFormatting(text: string, tone: BubbleTone): React.ReactNode[] {
  // Remove marcadores incompletos no final durante a digitação
  const cleaned = text.replace(/(\*{1,2}|`)$/, '');
  const tokens = cleaned.split(/(\*\*[^*]+\*\*|`[^`]+`|\*[^*\n]+\*)/g);

  const boldClass =
    tone === 'hint'
      ? 'font-semibold text-amber-950 bg-amber-100/90 px-1.5 py-0.5 rounded-md'
      : 'font-semibold text-indigo-950 bg-indigo-100/75 px-1.5 py-0.5 rounded-md';

  return tokens.map((token, idx) => {
    if (token.startsWith('**') && token.endsWith('**') && token.length > 4) {
      const inner = token.slice(2, -2);
      const isAlertWord = /\b(EXCETO|NÃO|INCORRETO|INCORRETAS|ERRADA|CUIDADO|ATENÇÃO)\b/i.test(
        inner
      );
      return (
        <strong
          key={idx}
          className={
            isAlertWord
              ? 'font-bold text-rose-900 bg-rose-100 px-1.5 py-0.5 rounded-md border border-rose-200/80'
              : boldClass
          }
        >
          {inner}
        </strong>
      );
    }
    if (token.startsWith('`') && token.endsWith('`') && token.length > 2) {
      return (
        <code
          key={idx}
          className="px-1.5 py-0.5 rounded-md bg-violet-100/80 text-violet-900 font-mono text-[12px] border border-violet-200/80"
        >
          {token.slice(1, -1)}
        </code>
      );
    }
    if (token.startsWith('*') && token.endsWith('*') && token.length > 2) {
      return (
        <em key={idx} className="italic font-medium text-sky-900">
          {token.slice(1, -1)}
        </em>
      );
    }
    return <span key={idx}>{token}</span>;
  });
}

function FormattedProfessorText({
  text,
  isTyping,
  tone,
}: {
  text: string;
  isTyping: boolean;
  tone: BubbleTone;
}) {
  const lines = text.split('\n');
  const blocks: Array<
    | { type: 'paragraph'; content: string }
    | { type: 'ordered'; num: string; title?: string; content: string }
    | { type: 'bullet'; title?: string; content: string }
    | { type: 'heading'; content: string }
  > = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    const headingMatch = line.match(/^#{1,3}\s+(.+)$/);
    if (headingMatch) {
      blocks.push({ type: 'heading', content: headingMatch[1] });
      continue;
    }

    const orderedMatch = line.match(/^(?:[-*•]\s+)?\*{0,2}(\d+)[.)]\s+(.+)$/);
    if (orderedMatch) {
      const rest = orderedMatch[2].replace(/^\*\*/, '**');
      const titleMatch = rest.match(/^\*{0,2}([^*:]+?):?\*\*:?\s*(.*)$/);
      if (titleMatch) {
        blocks.push({
          type: 'ordered',
          num: orderedMatch[1],
          title: titleMatch[1].replace(/^\*{1,2}/, '').replace(/:$/, ''),
          content: titleMatch[2],
        });
      } else {
        blocks.push({ type: 'ordered', num: orderedMatch[1], content: rest });
      }
      continue;
    }

    const bulletMatch = line.match(/^[-*•]\s+(.+)$/);
    if (bulletMatch) {
      const rest = bulletMatch[1];
      const titleMatch = rest.match(/^\*\*([^*]+?):?\*\*:?\s*(.*)$/);
      if (titleMatch) {
        blocks.push({
          type: 'bullet',
          title: titleMatch[1].replace(/:$/, ''),
          content: titleMatch[2],
        });
      } else {
        blocks.push({ type: 'bullet', content: rest });
      }
      continue;
    }

    blocks.push({ type: 'paragraph', content: line });
  }

  if (blocks.length === 0) {
    return null;
  }

  let orderedCounter = 0;

  return (
    <div className="space-y-2.5 text-[14.5px] leading-[1.65] text-zinc-800">
      {blocks.map((block, i) => {
        const isLast = i === blocks.length - 1;
        const cursor =
          isLast && isTyping ? (
            <span className="inline-block w-1.5 h-4 ml-1 align-middle bg-indigo-500 animate-pulse rounded-xs" />
          ) : null;

        if (block.type === 'heading') {
          return (
            <h4
              key={i}
              className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-indigo-800 bg-indigo-100/80 border border-indigo-200/80 px-2.5 py-1 rounded-lg"
            >
              {renderInlineFormatting(block.content, tone)}
              {cursor}
            </h4>
          );
        }

        if (block.type === 'ordered') {
          const accent = ORDERED_ITEM_ACCENTS[orderedCounter % ORDERED_ITEM_ACCENTS.length];
          orderedCounter += 1;
          return (
            <div
              key={i}
              className={cn(
                'flex items-start gap-3 rounded-xl border border-l-4 px-3.5 py-2.5 shadow-2xs',
                accent.card
              )}
            >
              <span
                className={cn(
                  'shrink-0 w-6 h-6 mt-0.5 rounded-lg text-xs font-bold flex items-center justify-center',
                  accent.badge
                )}
              >
                {block.num}
              </span>
              <div className="flex-1 min-w-0">
                {block.title && (
                  <div className={cn('text-sm font-bold leading-snug mb-0.5', accent.title)}>
                    {block.title}
                  </div>
                )}
                <div className="text-[13.5px] leading-relaxed text-zinc-700">
                  {renderInlineFormatting(block.content, tone)}
                  {cursor}
                </div>
              </div>
            </div>
          );
        }

        if (block.type === 'bullet') {
          const bulletAccent =
            tone === 'hint'
              ? 'border-amber-200/80 border-l-amber-400 bg-amber-50/50'
              : 'border-sky-200/80 border-l-sky-400 bg-sky-50/45';
          const dotColor = tone === 'hint' ? 'bg-amber-500' : 'bg-sky-500';
          return (
            <div
              key={i}
              className={cn(
                'flex items-start gap-2.5 rounded-xl border border-l-4 px-3 py-2',
                bulletAccent
              )}
            >
              <span className={cn('shrink-0 w-2 h-2 mt-2 rounded-full', dotColor)} />
              <div className="flex-1 min-w-0 text-[14px]">
                {block.title && (
                  <span className="font-bold text-zinc-900 mr-1.5">{block.title}:</span>
                )}
                {renderInlineFormatting(block.content, tone)}
                {cursor}
              </div>
            </div>
          );
        }

        const isTakeaway =
          i === blocks.length - 1 &&
          blocks.length > 2 &&
          /\b(dica|lembre|resumo|atenção|foco|portanto|ou seja)\b/i.test(block.content);

        return (
          <p
            key={i}
            className={cn(
              isTakeaway
                ? 'rounded-xl bg-emerald-50/80 border border-emerald-200/80 px-3.5 py-2.5 text-emerald-950 font-medium'
                : 'text-zinc-800'
            )}
          >
            {renderInlineFormatting(block.content, tone)}
            {cursor}
          </p>
        );
      })}
    </div>
  );
}

export function ProfessorCompanion({
  mood,
  message,
  badge,
  speakerName = 'Prof. IREB',
  className,
  questionCodigo,
  alreadySubmitted = false,
}: ProfessorCompanionProps) {
  const [hidden, setHidden] = useState(false);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [size, setSize] = useState<ProfessorSize>('lg');
  const [mobileSize, setMobileSize] = useState<number>(MOBILE_DEFAULT_SIZE);
  const [mobilePos, setMobilePos] = useState<{ x: number; y: number } | null>(null);
  const [isDraggingMobile, setIsDraggingMobile] = useState(false);
  const [isResizingMobile, setIsResizingMobile] = useState(false);
  const [displayedText, setDisplayedText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [frameIndex, setFrameIndex] = useState(0);

  const dragRef = useRef<{
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    moved: boolean;
  } | null>(null);

  const resizeRef = useRef<{
    startX: number;
    startY: number;
    originSize: number;
  } | null>(null);

  // Estado interativo de IA do Professor
  const [aiReply, setAiReply] = useState<string | null>(null);
  const [aiBadge, setAiBadge] = useState<string | null>(null);
  const [aiMeta, setAiMeta] = useState<{
    model?: string;
    usedFallback?: boolean;
    sources?: Array<{ id: string; eu: string; title: string }>;
  } | null>(null);
  const [aiLoading, setAiLoading] = useState<'hint' | 'ask' | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [hintLevel, setHintLevel] = useState(0);
  const [askOpen, setAskOpen] = useState(false);
  const [userQuestion, setUserQuestion] = useState('');
  const [lastAskedQuestion, setLastAskedQuestion] = useState<string | null>(null);
  const [bubbleExpanded, setBubbleExpanded] = useState(false);
  const [chatHistory, setChatHistory] = useState<ChatTurn[]>([]);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const typewriterRef = useRef<number | null>(null);

  // Carrega preferências de tamanho e posição mobile do professor
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(SIZE_STORAGE_KEY) as ProfessorSize | null;
      if (saved && saved in SIZE_CONFIG) {
        setSize(saved);
      }

      const savedMobileSize = Number(window.localStorage.getItem(MOBILE_SIZE_STORAGE_KEY));
      const initialSize =
        Number.isFinite(savedMobileSize) &&
        savedMobileSize >= MOBILE_MIN_SIZE &&
        savedMobileSize <= MOBILE_MAX_SIZE
          ? savedMobileSize
          : MOBILE_DEFAULT_SIZE;
      setMobileSize(initialSize);

      const savedPosRaw = window.localStorage.getItem(MOBILE_POS_STORAGE_KEY);
      if (savedPosRaw) {
        const parsed = JSON.parse(savedPosRaw) as { x?: number; y?: number };
        if (typeof parsed.x === 'number' && typeof parsed.y === 'number') {
          const clampedX = Math.max(
            4,
            Math.min(window.innerWidth - initialSize - 4, parsed.x)
          );
          const clampedY = Math.max(
            56,
            Math.min(window.innerHeight - initialSize - 76, parsed.y)
          );
          setMobilePos({ x: clampedX, y: clampedY });
          return;
        }
      }

      // Posição inicial padrão: canto inferior direito acima da barra mobile
      setMobilePos({
        x: Math.max(8, window.innerWidth - initialSize - 12),
        y: Math.max(64, window.innerHeight - initialSize - 84),
      });
    } catch {
      // ignora indisponibilidade de localStorage
    }
  }, []);

  const handleMobilePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!mobilePos) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      originX: mobilePos.x,
      originY: mobilePos.y,
      moved: false,
    };
    setIsDraggingMobile(true);
  };

  const handleMobilePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    if (Math.abs(dx) > 6 || Math.abs(dy) > 6) {
      drag.moved = true;
    }
    if (!drag.moved) return;

    const nextX = Math.max(
      4,
      Math.min(window.innerWidth - mobileSize - 4, drag.originX + dx)
    );
    const nextY = Math.max(
      56,
      Math.min(window.innerHeight - mobileSize - 72, drag.originY + dy)
    );
    setMobilePos({ x: nextX, y: nextY });
  };

  const handleMobilePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    const wasDrag = drag.moved;
    dragRef.current = null;
    setIsDraggingMobile(false);

    if (wasDrag) {
      if (mobilePos) {
        try {
          window.localStorage.setItem(MOBILE_POS_STORAGE_KEY, JSON.stringify(mobilePos));
        } catch {
          // ignora
        }
      }
    } else {
      setMobileDrawerOpen(true);
    }
  };

  const handleResizePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    resizeRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      originSize: mobileSize,
    };
    setIsResizingMobile(true);
  };

  const handleResizePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    const rz = resizeRef.current;
    if (!rz) return;
    const delta = Math.max(e.clientX - rz.startX, e.clientY - rz.startY);
    const nextSize = Math.round(
      Math.max(MOBILE_MIN_SIZE, Math.min(MOBILE_MAX_SIZE, rz.originSize + delta))
    );
    setMobileSize(nextSize);
    setMobilePos((prev) => {
      if (!prev) return prev;
      return {
        x: Math.max(4, Math.min(window.innerWidth - nextSize - 4, prev.x)),
        y: Math.max(56, Math.min(window.innerHeight - nextSize - 72, prev.y)),
      };
    });
  };

  const handleResizePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (!resizeRef.current) return;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    resizeRef.current = null;
    setIsResizingMobile(false);
    try {
      window.localStorage.setItem(MOBILE_SIZE_STORAGE_KEY, String(mobileSize));
      if (mobilePos) {
        window.localStorage.setItem(MOBILE_POS_STORAGE_KEY, JSON.stringify(mobilePos));
      }
    } catch {
      // ignora
    }
  };

  const handleSizeChange = (nextSize: ProfessorSize) => {
    setSize(nextSize);
    try {
      window.localStorage.setItem(SIZE_STORAGE_KEY, nextSize);
    } catch {
      // ignora indisponibilidade de localStorage
    }
  };

  // Reseta dicas e perguntas ao trocar de questão
  useEffect(() => {
    setAiReply(null);
    setAiBadge(null);
    setAiMeta(null);
    setAiError(null);
    setAiLoading(null);
    setHintLevel(0);
    setAskOpen(false);
    setUserQuestion('');
    setLastAskedQuestion(null);
    setBubbleExpanded(false);
    setChatHistory([]);
  }, [questionCodigo]);

  // Limpa override de IA quando o aluno confirma a resposta para o Professor reagir ao acerto/erro
  useEffect(() => {
    if (alreadySubmitted) {
      setAiReply(null);
      setAiBadge(null);
      setAiError(null);
    }
  }, [alreadySubmitted]);

  // Foca a caixa de pergunta quando aberta
  useEffect(() => {
    if (askOpen) {
      window.setTimeout(() => inputRef.current?.focus(), 40);
    }
  }, [askOpen]);

  const activeMessage = aiLoading
    ? aiLoading === 'hint'
      ? 'Hmm... deixe-me analisar a questão para te dar uma boa dica sem entregar a resposta!'
      : 'Boa pergunta! Deixe-me pensar na melhor explicação para você...'
    : aiReply ?? message;

  const activeBadge = aiLoading
    ? 'PENSANDO...'
    : aiBadge ?? badge;

  const baseMood: ProfessorMood = aiLoading ? 'thinking' : aiReply ? 'talking' : mood;

  // Typewriter effect estilo Visual Novel / Ace Attorney
  useEffect(() => {
    if (typewriterRef.current) {
      window.clearInterval(typewriterRef.current);
      typewriterRef.current = null;
    }

    setDisplayedText('');
    setIsTyping(true);
    let idx = 0;
    const stepMs = activeMessage.length > 220 ? 10 : 20;
    const charsPerTick =
      activeMessage.length > 700 ? 6 : activeMessage.length > 260 ? 3 : 1;

    const timer = window.setInterval(() => {
      idx += charsPerTick;
      if (idx >= activeMessage.length) {
        setDisplayedText(activeMessage);
        setIsTyping(false);
        window.clearInterval(timer);
        typewriterRef.current = null;
      } else {
        setDisplayedText(activeMessage.slice(0, idx));
      }
    }, stepMs);

    typewriterRef.current = timer;
    return () => {
      window.clearInterval(timer);
      typewriterRef.current = null;
    };
  }, [activeMessage]);

  const handleSkipTypewriter = () => {
    if (!isTyping) return;
    if (typewriterRef.current) {
      window.clearInterval(typewriterRef.current);
      typewriterRef.current = null;
    }
    setDisplayedText(activeMessage);
    setIsTyping(false);
  };

  // Quando termina de falar no modo talking, descansa para idle (como em Ace Attorney)
  const effectiveMood: ProfessorMood =
    baseMood === 'talking' && !isTyping && !aiLoading ? 'idle' : baseMood;
  const config = SPRITE_CONFIG[effectiveMood];

  useEffect(() => {
    setFrameIndex(0);
    const intervalMs = Math.round(1000 / config.fps);
    const timer = window.setInterval(() => {
      setFrameIndex((prev) => (prev + 1) % config.frames);
    }, intervalMs);
    return () => window.clearInterval(timer);
  }, [effectiveMood, config.fps, config.frames]);

  const handleRequestHint = async () => {
    if (!questionCodigo || aiLoading) return;
    const nextLevel = Math.min(3, hintLevel + 1);
    setAiLoading('hint');
    setAiError(null);
    try {
      const res = await fetch(
        `/api/questions/${encodeURIComponent(questionCodigo)}/professor`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'hint',
            hintLevel: nextLevel,
            alreadySubmitted,
          }),
        }
      );
      const data = (await res.json()) as {
        reply?: string;
        model?: string;
        sources?: Array<{ id: string; eu: string; title: string }>;
        usedFallback?: boolean;
        error?: string;
      };
      if (!res.ok || !data.reply) {
        throw new Error(data.error || 'Não foi possível obter uma dica agora.');
      }
      setHintLevel(nextLevel);
      setLastAskedQuestion(null);
      setBubbleExpanded(false);
      setAiReply(data.reply);
      setAiBadge(nextLevel > 1 ? `DICA #${nextLevel}` : 'DICA DO PROF.');
      setAiMeta({ model: data.model, usedFallback: data.usedFallback, sources: data.sources });
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'Erro ao pedir dica.');
    } finally {
      setAiLoading(null);
    }
  };

  const handleAskSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = userQuestion.trim();
    if (!questionCodigo || !trimmed || aiLoading) return;

    setAiLoading('ask');
    setAiError(null);
    try {
      const res = await fetch(
        `/api/questions/${encodeURIComponent(questionCodigo)}/professor`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'ask',
            userQuestion: trimmed,
            alreadySubmitted,
            history: chatHistory.slice(-6).map((turn) => ({
              role: turn.role,
              text: turn.text.slice(0, 6000),
            })),
          }),
        }
      );
      const data = (await res.json()) as {
        reply?: string;
        model?: string;
        sources?: Array<{ id: string; eu: string; title: string }>;
        usedFallback?: boolean;
        error?: string;
      };
      if (!res.ok || !data.reply) {
        throw new Error(data.error || 'Não foi possível responder à pergunta agora.');
      }

      setChatHistory((prev) => [
        ...prev.slice(-6),
        { role: 'user', text: trimmed },
        { role: 'model', text: data.reply! },
      ]);
      setUserQuestion('');
      setLastAskedQuestion(trimmed);
      setBubbleExpanded(data.reply.length > 350);
      setAiReply(data.reply);
      setAiBadge('RESPOSTA DO PROF.');
      setAiMeta({ model: data.model, usedFallback: data.usedFallback, sources: data.sources });
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'Erro ao enviar pergunta.');
    } finally {
      setAiLoading(null);
    }
  };

  if (hidden) {
    return (
      <div className={cn('flex justify-end', className)}>
        <button
          type="button"
          onClick={() => setHidden(false)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium bg-white border border-zinc-200 text-zinc-600 hover:bg-zinc-50 transition-colors"
        >
          <Eye className="w-3.5 h-3.5" />
          Mostrar {speakerName}
        </button>
      </div>
    );
  }

  const bubbleTone: BubbleTone = aiLoading
    ? 'thinking'
    : aiReply
      ? lastAskedQuestion
        ? 'ask'
        : 'hint'
      : 'default';

  const moodTheme =
    baseMood === 'angry_slam'
      ? {
          card: 'border-rose-300 bg-gradient-to-r from-rose-50/80 via-white to-white',
          nameplate: 'bg-rose-600 text-white border-rose-700',
          badge: 'bg-rose-100 text-rose-800 border-rose-300',
          bubble: 'border-rose-200 bg-gradient-to-br from-rose-50/50 via-white to-white',
        }
      : baseMood === 'celebrate_clap'
        ? {
            card: 'border-emerald-300 bg-gradient-to-r from-emerald-50/80 via-white to-white',
            nameplate: 'bg-emerald-600 text-white border-emerald-700',
            badge: 'bg-amber-100 text-amber-800 border-amber-300',
            bubble: 'border-emerald-200 bg-gradient-to-br from-emerald-50/50 via-white to-white',
          }
        : bubbleTone === 'hint'
          ? {
              card: 'border-amber-200/90 bg-gradient-to-r from-amber-50/40 via-white to-white',
              nameplate: 'bg-amber-600 text-white border-amber-700',
              badge: 'bg-amber-100 text-amber-900 border-amber-300',
              bubble:
                'border-amber-200/90 bg-gradient-to-br from-amber-50/85 via-white to-orange-50/35',
            }
          : bubbleTone === 'ask'
            ? {
                card: 'border-indigo-200/90 bg-gradient-to-r from-indigo-50/40 via-white to-sky-50/30',
                nameplate: 'bg-indigo-600 text-white border-indigo-700',
                badge: 'bg-sky-100 text-sky-900 border-sky-200',
                bubble:
                  'border-indigo-200/90 bg-gradient-to-br from-indigo-50/55 via-white to-sky-50/45',
              }
            : bubbleTone === 'thinking'
              ? {
                  card: 'border-violet-200/90 bg-gradient-to-r from-violet-50/50 via-white to-indigo-50/30',
                  nameplate: 'bg-violet-600 text-white border-violet-700',
                  badge: 'bg-violet-100 text-violet-900 border-violet-300',
                  bubble:
                    'border-violet-200/90 bg-gradient-to-br from-violet-50/70 via-white to-indigo-50/40',
                }
              : {
                  card: 'border-zinc-200/90 bg-white',
                  nameplate: 'bg-indigo-600 text-white border-indigo-700',
                  badge: 'bg-indigo-50 text-indigo-700 border-indigo-200',
                  bubble: 'border-zinc-200 bg-zinc-50/70',
                };

  const sizeStyles = SIZE_CONFIG[size];
  const bgPosX =
    config.frames > 1 ? `${(frameIndex / (config.frames - 1)) * 100}%` : '0%';

  const spriteStyle: React.CSSProperties = {
    backgroundImage: `url(${config.src})`,
    backgroundSize: `${config.frames * 100}% 100%`,
    backgroundPosition: `${bgPosX} 0%`,
    backgroundRepeat: 'no-repeat',
    imageRendering: 'pixelated',
  };

  return (
    <>
      {/* ==================== MOBILE: POPUP FLUTUANTE TRANSPARENTE + MENU LATERAL ==================== */}
      <div className="md:hidden">
        {/* Professor Flutuante sem fundo, arrastável e redimensionável */}
        {mobilePos && (
          <div
            role="button"
            tabIndex={0}
            aria-label={`Abrir menu do ${speakerName} (arraste para mover)`}
            onPointerDown={handleMobilePointerDown}
            onPointerMove={handleMobilePointerMove}
            onPointerUp={handleMobilePointerUp}
            onPointerCancel={handleMobilePointerUp}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setMobileDrawerOpen(true);
              }
            }}
            style={{
              left: `${mobilePos.x}px`,
              top: `${mobilePos.y}px`,
              width: `${mobileSize}px`,
              height: `${mobileSize}px`,
              touchAction: 'none',
            }}
            className={cn(
              'fixed z-40 select-none cursor-grab active:cursor-grabbing',
              (isDraggingMobile || isResizingMobile) && 'scale-[1.03]',
              baseMood === 'angry_slam' && frameIndex === 3 && 'animate-quiz-shake'
            )}
          >
            {/* Sprite completamente sem fundo, com sombra suave para destacar */}
            <div
              role="img"
              aria-label={`${speakerName} - ${effectiveMood}`}
              className="w-full h-full pointer-events-none drop-shadow-[0_6px_12px_rgba(0,0,0,0.28)]"
              style={spriteStyle}
            />

            {/* Badge discreta de reação/status */}
            {activeBadge && (
              <span
                className={cn(
                  'pointer-events-none absolute -top-2.5 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-full text-[9.5px] font-bold border shadow-sm whitespace-nowrap',
                  moodTheme.badge
                )}
              >
                {activeBadge}
              </span>
            )}

            {/* Alça de redimensionamento no canto inferior direito */}
            <div
              role="slider"
              aria-label="Arraste para alterar o tamanho do professor"
              aria-valuemin={MOBILE_MIN_SIZE}
              aria-valuemax={MOBILE_MAX_SIZE}
              aria-valuenow={mobileSize}
              onPointerDown={handleResizePointerDown}
              onPointerMove={handleResizePointerMove}
              onPointerUp={handleResizePointerUp}
              onPointerCancel={handleResizePointerUp}
              style={{ touchAction: 'none' }}
              className="absolute -right-1.5 -bottom-1.5 w-6 h-6 rounded-full bg-zinc-900/75 text-white border border-white/80 shadow-md flex items-center justify-center cursor-nwse-resize"
              title="Arraste para redimensionar"
            >
              <svg
                viewBox="0 0 12 12"
                className="w-3 h-3"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
              >
                <path d="M4 10L10 4M7.5 10L10 7.5" />
              </svg>
            </div>
          </div>
        )}

        {/* Menu Lateral (Drawer do Professor) */}
        {mobileDrawerOpen && (
          <div className="fixed inset-0 z-50 flex justify-end">
            <div
              className="fixed inset-0 bg-zinc-950/40 backdrop-blur-[2px]"
              onClick={() => setMobileDrawerOpen(false)}
            />
            <aside
              aria-label={`Chat e dicas do ${speakerName}`}
              className="relative z-10 w-[92vw] max-w-sm h-full bg-white shadow-2xl border-l border-zinc-200 flex flex-col animate-card-enter"
            >
              {/* Cabeçalho do Drawer com Sprite do Professor */}
              <div className={cn('p-4 border-b border-zinc-200/80 flex items-center gap-3.5', moodTheme.card)}>
                <div className="w-20 h-20 shrink-0 rounded-2xl bg-zinc-900/5 border border-zinc-200/80 overflow-hidden">
                  <div
                    role="img"
                    aria-label={`${speakerName} - ${effectiveMood}`}
                    className="w-full h-full"
                    style={spriteStyle}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span
                      className={cn(
                        'inline-flex items-center px-2 py-0.5 rounded-md text-[10.5px] font-bold uppercase tracking-wider border',
                        moodTheme.nameplate
                      )}
                    >
                      {speakerName}
                    </span>
                    {activeBadge && (
                      <span
                        className={cn(
                          'inline-flex items-center px-2 py-0.5 rounded-md text-[10.5px] font-bold border',
                          moodTheme.badge
                        )}
                      >
                        {activeBadge}
                      </span>
                    )}
                  </div>
                  {aiMeta && (
                    <div className="mt-1.5">
                      <span
                        className={cn(
                          'inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium border',
                          aiMeta.usedFallback
                            ? 'bg-amber-50 text-amber-700 border-amber-200'
                            : 'bg-violet-50 text-violet-700 border-violet-200'
                        )}
                      >
                        <Sparkles className="w-3 h-3" />
                        {aiMeta.usedFallback
                          ? 'Modo local'
                          : aiMeta.model?.includes('3.1')
                            ? 'Gemini 3.1'
                            : aiMeta.model || 'Gemini'}
                      </span>
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setMobileDrawerOpen(false)}
                  className="self-start p-2 rounded-xl text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 transition-colors"
                  aria-label="Fechar painel do professor"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Corpo rolável com a fala / resposta colorida */}
              <div
                className="flex-1 overflow-y-auto p-4 space-y-3 bg-zinc-50/50"
                onClick={handleSkipTypewriter}
              >
                <div className={cn('rounded-2xl border p-3.5 shadow-2xs', moodTheme.bubble)}>
                  {lastAskedQuestion && aiReply && !aiLoading && (
                    <div className="mb-2.5 pb-2 border-b border-zinc-200/70 text-xs text-zinc-600">
                      <span className="font-semibold text-indigo-700">Sua pergunta:</span>{' '}
                      &ldquo;{lastAskedQuestion}&rdquo;
                    </div>
                  )}
                  <FormattedProfessorText
                    text={displayedText}
                    isTyping={isTyping}
                    tone={bubbleTone}
                  />
                  {aiMeta?.sources && aiMeta.sources.length > 0 && aiReply && !aiLoading && (
                    <div className="mt-3 pt-2.5 border-t border-zinc-200/70 flex flex-wrap items-center gap-1.5">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                        Base Oficial IREB:
                      </span>
                      {aiMeta.sources.map((src) => (
                        <span
                          key={src.id}
                          className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-medium bg-emerald-50 text-emerald-800 border border-emerald-200/80"
                        >
                          {src.eu} • {src.title}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {aiError && (
                  <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">
                    {aiError}
                  </p>
                )}
              </div>

              {/* Rodapé fixo do Drawer: Botão Dica + Chat */}
              {questionCodigo && (
                <div className="p-3.5 border-t border-zinc-200 bg-white space-y-2.5 pb-[calc(0.875rem+env(safe-area-inset-bottom))]">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={aiLoading !== null}
                      onClick={handleRequestHint}
                      className="flex-1 justify-center inline-flex items-center gap-1.5 min-h-[42px] px-3.5 py-2 rounded-xl text-xs font-semibold bg-amber-50 border border-amber-200/90 text-amber-900 hover:bg-amber-100/80 active:scale-[0.98] disabled:opacity-50 transition-all"
                    >
                      {aiLoading === 'hint' ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Lightbulb className="w-4 h-4 text-amber-600" />
                      )}
                      {hintLevel === 0
                        ? 'Pedir dica (sem spoiler)'
                        : hintLevel < 3
                          ? `Pedir dica #${hintLevel + 1}`
                          : 'Outra dica'}
                    </button>

                    {aiReply && (
                      <button
                        type="button"
                        onClick={() => {
                          setAiReply(null);
                          setAiBadge(null);
                          setAiError(null);
                          setLastAskedQuestion(null);
                        }}
                        className="inline-flex items-center justify-center min-h-[42px] px-3 rounded-xl text-xs font-medium border border-zinc-200 text-zinc-600 hover:bg-zinc-50"
                        title="Voltar à fala padrão"
                      >
                        <RotateCcw className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  <form
                    onSubmit={handleAskSubmit}
                    className="flex items-center gap-2 bg-zinc-50 rounded-xl border border-indigo-200 p-1.5"
                  >
                    <input
                      type="text"
                      value={userQuestion}
                      onChange={(e) => setUserQuestion(e.target.value)}
                      disabled={aiLoading !== null}
                      placeholder={
                        alreadySubmitted
                          ? 'Pergunte sobre o gabarito...'
                          : 'Pergunte algo ao Prof. IREB...'
                      }
                      maxLength={800}
                      className="flex-1 min-w-0 bg-transparent px-2.5 py-2 text-[16px] text-zinc-900 placeholder:text-zinc-400 focus:outline-none"
                    />
                    <button
                      type="submit"
                      disabled={aiLoading !== null || userQuestion.trim().length === 0}
                      className="inline-flex items-center justify-center min-h-[40px] px-3.5 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 disabled:opacity-40 transition-colors shrink-0"
                    >
                      {aiLoading === 'ask' ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Send className="w-4 h-4" />
                      )}
                    </button>
                  </form>
                </div>
              )}
            </aside>
          </div>
        )}
      </div>

      {/* ==================== DESKTOP: CARD COMPLETO ==================== */}
      <section
        aria-label="Professor assistente"
        className={cn(
          'hidden md:block relative rounded-2xl border p-4 sm:p-5 transition-colors shadow-2xs',
          moodTheme.card,
          baseMood === 'angry_slam' && frameIndex === 3 && 'animate-quiz-shake',
          className
        )}
      >
        <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-5">
          {/* Sprite Pixel Art escalado com nitidez e tamanho configurável */}
          <div
            className={cn(
              'shrink-0 mx-auto sm:mx-0 rounded-2xl bg-zinc-900/5 border border-zinc-200/80 flex items-center justify-center overflow-hidden transition-[width,height] duration-200',
              sizeStyles.boxClass
            )}
            title={`${speakerName} (${sizeStyles.title})`}
          >
            <div
              role="img"
              aria-label={`${speakerName} - ${effectiveMood}`}
              className="w-full h-full"
              style={spriteStyle}
            />
          </div>

        {/* Balão de fala + Controles interativos do Professor */}
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={cn(
                  'inline-flex items-center px-2.5 py-0.5 rounded-md text-[11px] font-bold uppercase tracking-wider border',
                  moodTheme.nameplate
                )}
              >
                {speakerName}
              </span>
              {activeBadge && (
                <span
                  className={cn(
                    'inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold border',
                    moodTheme.badge
                  )}
                >
                  {activeBadge}
                </span>
              )}
              {aiMeta && (
                <span
                  className={cn(
                    'inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium border',
                    aiMeta.usedFallback
                      ? 'bg-amber-50 text-amber-700 border-amber-200'
                      : 'bg-violet-50 text-violet-700 border-violet-200'
                  )}
                  title={
                    aiMeta.usedFallback
                      ? 'Configure GEMINI_API_KEY no arquivo .env.local para ativar o Gemini 3.1'
                      : `Respondido por ${aiMeta.model}`
                  }
                >
                  <Sparkles className="w-3 h-3" />
                  {aiMeta.usedFallback
                    ? 'Modo local (sem API Key)'
                    : aiMeta.model?.includes('3.1')
                      ? 'Gemini 3.1'
                      : aiMeta.model || 'Gemini'}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              {/* Seletor de tamanho do Professor */}
              <div
                className="inline-flex items-center rounded-lg border border-zinc-200 bg-zinc-50 p-0.5"
                role="group"
                aria-label="Tamanho do professor"
              >
                {(Object.keys(SIZE_CONFIG) as ProfessorSize[]).map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => handleSizeChange(key)}
                    title={`Tamanho: ${SIZE_CONFIG[key].title}`}
                    className={cn(
                      'px-1.5 py-0.5 rounded-md text-[10px] font-semibold transition-colors',
                      size === key
                        ? 'bg-zinc-900 text-white'
                        : 'text-zinc-500 hover:text-zinc-800'
                    )}
                  >
                    {SIZE_CONFIG[key].label}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={() => setHidden(true)}
                className="inline-flex items-center gap-1 text-[11px] text-zinc-400 hover:text-zinc-600 transition-colors"
                title="Ocultar professor"
              >
                <EyeOff className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Ocultar</span>
              </button>
            </div>
          </div>

          {/* Balão de fala */}
          <div
            onClick={handleSkipTypewriter}
            title={isTyping ? 'Clique para mostrar o texto completo' : undefined}
            className={cn(
              'relative rounded-2xl border px-4 py-3.5 min-h-[68px] transition-all',
              !bubbleExpanded && 'max-h-72 overflow-y-auto',
              isTyping && 'cursor-pointer',
              moodTheme.bubble
            )}
          >
            {lastAskedQuestion && aiReply && !aiLoading && (
              <div className="mb-2.5 pb-2 border-b border-zinc-200/70 flex items-center justify-between gap-2">
                <div className="text-xs text-zinc-500 truncate">
                  <span className="font-semibold text-indigo-700">Sua pergunta:</span>{' '}
                  &ldquo;{lastAskedQuestion}&rdquo;
                </div>
                {activeMessage.length > 260 && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setBubbleExpanded((v) => !v);
                    }}
                    className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium text-zinc-500 hover:text-zinc-800 hover:bg-zinc-200/60 transition-colors"
                    title={bubbleExpanded ? 'Recolher balão' : 'Expandir resposta completa'}
                  >
                    {bubbleExpanded ? (
                      <>
                        <Minimize2 className="w-3 h-3" />
                        Recolher
                      </>
                    ) : (
                      <>
                        <Maximize2 className="w-3 h-3" />
                        Expandir
                      </>
                    )}
                  </button>
                )}
              </div>
            )}

            <FormattedProfessorText
              text={displayedText}
              isTyping={isTyping}
              tone={bubbleTone}
            />

            {aiMeta?.sources && aiMeta.sources.length > 0 && aiReply && !aiLoading && (
              <div className="mt-3 pt-2.5 border-t border-zinc-200/70 flex flex-wrap items-center gap-1.5">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                  Base Oficial IREB:
                </span>
                {aiMeta.sources.map((src) => (
                  <span
                    key={src.id}
                    className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-medium bg-emerald-50 text-emerald-800 border border-emerald-200/80"
                  >
                    {src.eu} • {src.title}
                  </span>
                ))}
              </div>
            )}

            {!lastAskedQuestion && activeMessage.length > 260 && !aiLoading && (
              <div className="mt-2.5 pt-2 border-t border-zinc-200/60 flex justify-end">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setBubbleExpanded((v) => !v);
                  }}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium text-zinc-500 hover:text-zinc-800 hover:bg-zinc-200/60 transition-colors"
                >
                  {bubbleExpanded ? (
                    <>
                      <Minimize2 className="w-3 h-3" />
                      Recolher
                    </>
                  ) : (
                    <>
                      <Maximize2 className="w-3 h-3" />
                      Expandir
                    </>
                  )}
                </button>
              </div>
            )}
          </div>

          {/* Barra de ações de IA do Professor (somente quando vinculado a uma questão) */}
          {questionCodigo && (
            <div className="mt-3 space-y-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={aiLoading !== null}
                  onClick={handleRequestHint}
                  className="flex-1 sm:flex-none justify-center inline-flex items-center gap-1.5 min-h-[40px] sm:min-h-0 px-3.5 py-2 sm:py-1.5 rounded-xl text-xs font-semibold bg-amber-50 border border-amber-200/90 text-amber-900 hover:bg-amber-100/80 active:scale-[0.98] disabled:opacity-50 transition-all"
                >
                  {aiLoading === 'hint' ? (
                    <Loader2 className="w-4 h-4 sm:w-3.5 sm:h-3.5 animate-spin" />
                  ) : (
                    <Lightbulb className="w-4 h-4 sm:w-3.5 sm:h-3.5 text-amber-600" />
                  )}
                  {hintLevel === 0
                    ? 'Pedir dica'
                    : hintLevel < 3
                      ? `Dica #${hintLevel + 1}`
                      : 'Outra dica'}
                </button>

                <button
                  type="button"
                  disabled={aiLoading !== null}
                  onClick={() => setAskOpen((v) => !v)}
                  className={cn(
                    'flex-1 sm:flex-none justify-center inline-flex items-center gap-1.5 min-h-[40px] sm:min-h-0 px-3.5 py-2 sm:py-1.5 rounded-xl text-xs font-semibold border active:scale-[0.98] transition-all disabled:opacity-50',
                    askOpen
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-indigo-50/70 border-indigo-200 text-indigo-800 hover:bg-indigo-100/80'
                  )}
                >
                  <MessageCircleQuestion className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
                  Perguntar
                </button>

                {aiReply && (
                  <button
                    type="button"
                    onClick={() => {
                      setAiReply(null);
                      setAiBadge(null);
                      setAiError(null);
                      setLastAskedQuestion(null);
                      setBubbleExpanded(false);
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[11px] font-medium text-zinc-500 hover:text-zinc-800 hover:bg-zinc-100 transition-colors"
                    title="Voltar à fala padrão do professor"
                  >
                    <RotateCcw className="w-3 h-3" />
                    Fala padrão
                  </button>
                )}
              </div>

              {aiError && (
                <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">
                  {aiError}
                </p>
              )}

              {/* Caixa de pergunta aberta para o Professor */}
              {askOpen && (
                <form
                  onSubmit={handleAskSubmit}
                  className="flex items-center gap-2 bg-white rounded-xl border border-indigo-200 p-1.5 shadow-2xs"
                >
                  <input
                    ref={inputRef}
                    type="text"
                    value={userQuestion}
                    onChange={(e) => setUserQuestion(e.target.value)}
                    disabled={aiLoading !== null}
                    placeholder={
                      alreadySubmitted
                        ? 'Tire uma dúvida sobre a questão ou o gabarito...'
                        : 'Pergunte ao Prof. IREB (ele responde sem entregar o gabarito)...'
                    }
                    maxLength={800}
                    className="flex-1 min-w-0 bg-transparent px-2.5 py-2 sm:py-1.5 text-[16px] sm:text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none"
                  />
                  <button
                    type="submit"
                    disabled={aiLoading !== null || userQuestion.trim().length === 0}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-medium hover:bg-indigo-700 disabled:opacity-40 transition-colors shrink-0"
                  >
                    {aiLoading === 'ask' ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Send className="w-3.5 h-3.5" />
                    )}
                    Enviar
                  </button>
                  <button
                    type="button"
                    onClick={() => setAskOpen(false)}
                    className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-colors shrink-0"
                    title="Fechar caixa de pergunta"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </form>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
    </>
  );
}

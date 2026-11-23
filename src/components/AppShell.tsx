'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  BarChart3,
  BookOpen,
  ClipboardCheck,
  Database,
  GraduationCap,
  LayoutDashboard,
  LogOut,
  Menu,
  RotateCcw,
  Settings,
  Star,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { isSoundEnabled, playSound, setSoundEnabled } from '@/lib/sounds';
import { AmbientMusicPlayer } from '@/components/AmbientMusicPlayer';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

const NAV_ITEMS = [
  { href: '/', label: 'Visão geral', icon: LayoutDashboard },
  { href: '/estudar', label: 'Estudar', icon: BookOpen },
  { href: '/simulados', label: 'Simulados', icon: ClipboardCheck },
  { href: '/questoes', label: 'Questões', icon: Database },
  { href: '/revisao', label: 'Revisão de erros', icon: RotateCcw },
  { href: '/favoritas', label: 'Favoritas', icon: Star },
  { href: '/relatorios', label: 'Relatórios', icon: BarChart3 },
  { href: '/configuracoes', label: 'Configurações', icon: Settings },
];

const MOBILE_TABS = [
  { href: '/', label: 'Início', icon: LayoutDashboard },
  { href: '/estudar', label: 'Estudar', icon: BookOpen },
  { href: '/simulados', label: 'Simulados', icon: ClipboardCheck },
  { href: '/revisao', label: 'Revisão', icon: RotateCcw },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  useEffect(() => {
    setSoundOn(isSoundEnabled());
    try {
      const supabase = createSupabaseBrowserClient();
      supabase.auth.getUser().then(({ data }) => {
        setUserEmail(data.user?.email ?? null);
      });
    } catch {
      // ignora se Supabase não estiver configurado
    }
  }, [pathname]);

  const handleLogout = async () => {
    try {
      const supabase = createSupabaseBrowserClient();
      await supabase.auth.signOut();
    } catch {
      // ignora
    }
    setMobileOpen(false);
    router.replace('/login');
    router.refresh();
  };

  // Tela de login renderiza limpa sem sidebar nem bottom bar
  if (pathname === '/login') {
    return <>{children}</>;
  }

  const toggleSound = () => {
    const next = !soundOn;
    setSoundOn(next);
    setSoundEnabled(next);
    if (next) {
      playSound('select', true);
    }
  };

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/';
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-zinc-50">
      {/* Header Mobile */}
      <header className="lg:hidden sticky top-0 z-30 flex items-center justify-between px-4 h-14 bg-white/95 backdrop-blur border-b border-zinc-200">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-zinc-900 text-white flex items-center justify-center">
            <GraduationCap className="w-4 h-4" />
          </div>
          <div className="leading-tight">
            <div className="text-sm font-semibold tracking-tight text-zinc-900">CPRE Studio</div>
            <div className="text-[11px] text-zinc-500">IREB CPRE-FL</div>
          </div>
        </Link>
        <div className="flex items-center gap-1.5">
          <AmbientMusicPlayer compact />
          <button
            type="button"
            onClick={toggleSound}
            className="p-2 rounded-lg text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 transition-colors"
            aria-label={soundOn ? 'Desativar sons' : 'Ativar sons'}
            title={soundOn ? 'Sons ativados' : 'Sons desativados'}
          >
            {soundOn ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4 text-zinc-400" />}
          </button>
          <button
            type="button"
            onClick={() => setMobileOpen((v) => !v)}
            className="p-2 rounded-lg text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 transition-colors"
            aria-label="Alternar menu de navegação"
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </header>

      {/* Drawer Mobile */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-40 flex">
          <div
            className="fixed inset-0 bg-zinc-950/30 backdrop-blur-[1px]"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="relative z-50 w-68 max-w-[82vw] bg-white border-r border-zinc-200 flex flex-col h-full shadow-xl">
            <div className="h-14 px-4 flex items-center justify-between border-b border-zinc-100">
              <span className="text-sm font-semibold text-zinc-900">Navegação</span>
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="p-1.5 rounded-md text-zinc-500 hover:bg-zinc-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileOpen(false)}
                    className={cn(
                      'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                      active
                        ? 'bg-zinc-900 text-white'
                        : 'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900'
                    )}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </nav>
            <div className="p-3 border-t border-zinc-100 space-y-2.5">
              <AmbientMusicPlayer />
              {userEmail && (
                <button
                  type="button"
                  onClick={handleLogout}
                  className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-zinc-200 text-xs font-medium text-rose-700 hover:bg-rose-50 transition-colors"
                >
                  <span className="truncate text-zinc-600">{userEmail}</span>
                  <span className="inline-flex items-center gap-1 shrink-0 font-semibold">
                    <LogOut className="w-3.5 h-3.5" />
                    Sair
                  </span>
                </button>
              )}
            </div>
          </aside>
        </div>
      )}

      {/* Sidebar Desktop */}
      <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:fixed lg:inset-y-0 bg-white border-r border-zinc-200/80 z-20">
        <div className="h-16 px-5 flex items-center gap-3 border-b border-zinc-100">
          <div className="w-8 h-8 rounded-lg bg-zinc-900 text-white flex items-center justify-center shadow-xs">
            <GraduationCap className="w-4 h-4" />
          </div>
          <div className="leading-tight">
            <div className="text-sm font-semibold tracking-tight text-zinc-900">CPRE Studio</div>
            <div className="text-[11px] text-zinc-500 font-medium">IREB CPRE Foundation</div>
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 px-3 py-2 rounded-lg text-[13.5px] font-medium transition-all',
                  active
                    ? 'bg-zinc-900 text-white shadow-xs'
                    : 'text-zinc-600 hover:bg-zinc-100/80 hover:text-zinc-950'
                )}
              >
                <Icon className={cn('w-4 h-4 shrink-0', active ? 'text-white' : 'text-zinc-400')} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-zinc-100 space-y-2.5">
          <AmbientMusicPlayer />

          <button
            type="button"
            onClick={toggleSound}
            className="w-full flex items-center justify-between px-3 py-2 rounded-lg border border-zinc-200/80 bg-white hover:bg-zinc-50 text-xs font-medium text-zinc-700 transition-colors"
          >
            <span className="flex items-center gap-2">
              {soundOn ? (
                <Volume2 className="w-3.5 h-3.5 text-indigo-600" />
              ) : (
                <VolumeX className="w-3.5 h-3.5 text-zinc-400" />
              )}
              Efeitos sonoros
            </span>
            <span
              className={cn(
                'text-[11px] px-1.5 py-0.5 rounded font-medium',
                soundOn ? 'bg-indigo-50 text-indigo-700' : 'bg-zinc-100 text-zinc-500'
              )}
            >
              {soundOn ? 'Ativo' : 'Mudo'}
            </span>
          </button>

          <div className="rounded-lg bg-zinc-50 border border-zinc-200/70 px-3 py-2.5">
            <div className="text-[11px] font-medium text-zinc-500 uppercase tracking-wider">
              Nuvem Supabase
            </div>
            <div className="text-xs font-medium text-zinc-800 mt-0.5 truncate">
              {userEmail ?? '45 questões IREB CPRE-FL'}
            </div>
            {userEmail ? (
              <button
                type="button"
                onClick={handleLogout}
                className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-semibold text-rose-600 hover:text-rose-800 transition-colors"
              >
                <LogOut className="w-3 h-3" />
                Sair da conta
              </button>
            ) : (
              <div className="text-[11px] text-zinc-500 mt-0.5">Sincronização ativa</div>
            )}
          </div>
        </div>
      </aside>

      {/* Área Principal */}
      <main className="flex-1 lg:pl-64 min-w-0">
        <div className="max-w-6xl mx-auto px-3 sm:px-6 lg:px-8 pt-4 pb-24 sm:py-6 lg:py-8">
          {children}
        </div>
      </main>

      {/* Bottom Tab Bar Mobile (estilo App Nativo) */}
      <nav
        aria-label="Navegação rápida mobile"
        className="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-white/95 backdrop-blur-md border-t border-zinc-200/90 shadow-[0_-4px_20px_rgba(0,0,0,0.05)] pb-[env(safe-area-inset-bottom)]"
      >
        <div className="grid grid-cols-5 h-16 max-w-lg mx-auto px-1">
          {MOBILE_TABS.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex flex-col items-center justify-center gap-1 rounded-xl transition-colors active:scale-95',
                  active ? 'text-indigo-600' : 'text-zinc-500 hover:text-zinc-900'
                )}
              >
                <span
                  className={cn(
                    'flex items-center justify-center w-10 h-7 rounded-full transition-colors',
                    active && 'bg-indigo-50'
                  )}
                >
                  <Icon className={cn('w-5 h-5', active && 'stroke-[2.25]')} />
                </span>
                <span className={cn('text-[10.5px] leading-none', active ? 'font-bold' : 'font-medium')}>
                  {item.label}
                </span>
              </Link>
            );
          })}

          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="flex flex-col items-center justify-center gap-1 rounded-xl text-zinc-500 hover:text-zinc-900 active:scale-95 transition-colors"
            aria-label="Abrir mais opções"
          >
            <span className="flex items-center justify-center w-10 h-7 rounded-full">
              <Menu className="w-5 h-5" />
            </span>
            <span className="text-[10.5px] leading-none font-medium">Mais</span>
          </button>
        </div>
      </nav>
    </div>
  );
}

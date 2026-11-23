'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { GraduationCap, Loader2, Lock, Mail, UserPlus, LogIn } from 'lucide-react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = searchParams.get('next') || '/estudar';

  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setInfo(null);

    try {
      const supabase = createSupabaseBrowserClient();

      if (mode === 'signup') {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
        });
        if (signUpError) throw signUpError;

        if (data.session) {
          router.replace(nextPath);
          router.refresh();
          return;
        }
        setInfo(
          'Conta criada! Se o Supabase solicitar confirmação por e-mail, verifique sua caixa de entrada e depois faça login.'
        );
        setMode('login');
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (signInError) throw signInError;
        router.replace(nextPath);
        router.refresh();
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro ao autenticar.';
      if (msg.toLowerCase().includes('invalid login credentials')) {
        setError('E-mail ou senha incorretos.');
      } else if (msg.toLowerCase().includes('email not confirmed')) {
        setError('Confirme seu e-mail antes de entrar.');
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-gradient-to-br from-zinc-50 via-indigo-50/40 to-zinc-100 p-4">
      <div className="w-full max-w-md bg-white rounded-3xl border border-zinc-200/90 shadow-xl p-6 sm:p-8 space-y-6">
        <div className="flex flex-col items-center text-center space-y-3">
          <div className="relative w-24 h-24 rounded-2xl bg-indigo-50/60 border border-indigo-100 flex items-center justify-center overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/icons/icon-192.png"
              alt="Prof. IREB"
              className="w-24 h-24 object-contain"
              style={{ imageRendering: 'pixelated' }}
            />
          </div>
          <div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-zinc-900 text-white text-[11px] font-semibold mb-1.5">
              <GraduationCap className="w-3.5 h-3.5" />
              CPRE Studio • IREB CPRE-FL
            </div>
            <h1 className="text-xl font-bold tracking-tight text-zinc-950">
              {mode === 'login' ? 'Entrar na sua conta' : 'Criar conta de estudos'}
            </h1>
            <p className="text-xs text-zinc-500 mt-1">
              Seu progresso, simulados, favoritos e anotações sincronizados na nuvem entre PC e celular.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 p-1 rounded-xl bg-zinc-100 text-xs font-semibold">
          <button
            type="button"
            onClick={() => {
              setMode('login');
              setError(null);
            }}
            className={`py-2 rounded-lg transition-all ${
              mode === 'login' ? 'bg-white text-zinc-950 shadow-xs' : 'text-zinc-500'
            }`}
          >
            Entrar
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('signup');
              setError(null);
            }}
            className={`py-2 rounded-lg transition-all ${
              mode === 'signup' ? 'bg-white text-zinc-950 shadow-xs' : 'text-zinc-500'
            }`}
          >
            Criar conta
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="email" className="block text-xs font-semibold text-zinc-700">
              E-mail
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                id="email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="voce@email.com"
                className="w-full rounded-xl border border-zinc-200 bg-zinc-50/50 pl-10 pr-3.5 py-2.5 text-[16px] sm:text-sm text-zinc-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="password" className="block text-xs font-semibold text-zinc-700">
              Senha
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                id="password"
                type="password"
                required
                minLength={6}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mínimo 6 caracteres"
                className="w-full rounded-xl border border-zinc-200 bg-zinc-50/50 pl-10 pr-3.5 py-2.5 text-[16px] sm:text-sm text-zinc-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400"
              />
            </div>
          </div>

          {error && (
            <div className="rounded-xl bg-rose-50 border border-rose-200 px-3.5 py-2.5 text-xs text-rose-800">
              {error}
            </div>
          )}

          {info && (
            <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-3.5 py-2.5 text-xs text-emerald-800">
              {info}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full min-h-[46px] inline-flex items-center justify-center gap-2 rounded-xl bg-zinc-900 text-white text-sm font-semibold hover:bg-zinc-800 active:scale-[0.99] disabled:opacity-50 transition-all shadow-sm"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : mode === 'login' ? (
              <LogIn className="w-4 h-4" />
            ) : (
              <UserPlus className="w-4 h-4" />
            )}
            {loading
              ? 'Aguarde...'
              : mode === 'login'
                ? 'Entrar no CPRE Studio'
                : 'Criar minha conta'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-zinc-50" />}>
      <LoginForm />
    </Suspense>
  );
}

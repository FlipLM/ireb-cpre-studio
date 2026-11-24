'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  Download,
  Image as ImageIcon,
  Save,
  Smartphone,
  Sparkles,
  Upload,
} from 'lucide-react';
import { formatDateBR } from '@/lib/utils';
import type {
  AppSettings,
  ImportValidationReport,
  QuestionWithProgress,
  SourceImportLog,
} from '@/types/domain';

interface SettingsResponse {
  settings: AppSettings;
  imports: SourceImportLog[];
  bankSummary: {
    totalQuestions: number;
    unicaCount: number;
    multiplaCount: number;
    withImageCount: number;
    missingImageCount: number;
    aiProviderConfigured: boolean;
    geminiConfigured?: boolean;
    geminiModel?: string;
  };
  questionsWithImages: QuestionWithProgress[];
}

interface AndroidProfessorState {
  enabled: boolean;
  hasPermission: boolean;
  targetQuestions: number;
  windowMinutes: number;
  testStressMode: boolean;
}

interface AndroidProfessorBridge {
  getStateJson?: () => string;
  toggleOverlay?: () => void;
  saveSettings?: (targetQuestions: number, windowMinutes: number, testStressMode: boolean) => void;
}

export default function ConfiguracoesPage() {
  const [data, setData] = useState<SettingsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const [androidState, setAndroidState] = useState<AndroidProfessorState | null>(null);
  const [androidTarget, setAndroidTarget] = useState(10);
  const [androidWindow, setAndroidWindow] = useState(120);
  const [androidTestStress, setAndroidTestStress] = useState(false);
  const [androidSavedMsg, setAndroidSavedMsg] = useState<string | null>(null);

  const [errorStreak, setErrorStreak] = useState(2);
  const [minTopicAnswers, setMinTopicAnswers] = useState(2);
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsSavedMsg, setSettingsSavedMsg] = useState<string | null>(null);

  // Importação de JSON
  const [pendingRawJson, setPendingRawJson] = useState<string | null>(null);
  const [pendingFilename, setPendingFilename] = useState<string>('questoes.json');
  const [dryRunReport, setDryRunReport] = useState<ImportValidationReport | null>(null);
  const [importing, setImporting] = useState(false);
  const [importMessage, setImportMessage] = useState<string | null>(null);

  const [uploadingCodigo, setUploadingCodigo] = useState<string | null>(null);

  const loadSettings = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/settings');
      const d = (await res.json()) as SettingsResponse;
      setData(d);
      setErrorStreak(d.settings.errorReviewRequiredStreak);
      setMinTopicAnswers(d.settings.minAnswersForTopicPercent);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  const syncAndroidState = useCallback(() => {
    if (typeof window === 'undefined') return;
    const bridge = (window as unknown as { AndroidProfessor?: AndroidProfessorBridge })
      .AndroidProfessor;
    if (!bridge?.getStateJson) return;
    try {
      const parsed = JSON.parse(bridge.getStateJson()) as AndroidProfessorState;
      setAndroidState(parsed);
      setAndroidTarget(parsed.targetQuestions ?? 10);
      setAndroidWindow(parsed.windowMinutes ?? 120);
      setAndroidTestStress(Boolean(parsed.testStressMode));
    } catch {
      // ignora erro de parse
    }
  }, []);

  useEffect(() => {
    syncAndroidState();
    const handler = () => syncAndroidState();
    window.addEventListener('android-professor-state', handler);
    return () => window.removeEventListener('android-professor-state', handler);
  }, [syncAndroidState]);

  const handleToggleAndroidOverlay = () => {
    const bridge = (window as unknown as { AndroidProfessor?: AndroidProfessorBridge })
      .AndroidProfessor;
    bridge?.toggleOverlay?.();
    setTimeout(syncAndroidState, 200);
  };

  const handleSaveAndroidOverlaySettings = () => {
    const bridge = (window as unknown as { AndroidProfessor?: AndroidProfessorBridge })
      .AndroidProfessor;
    bridge?.saveSettings?.(
      Math.max(1, androidTarget),
      Math.max(5, androidWindow),
      androidTestStress
    );
    setAndroidSavedMsg('Preferências do Professor Flutuante salvas.');
    setTimeout(syncAndroidState, 150);
  };

  const handleSaveSettings = async () => {
    setSavingSettings(true);
    setSettingsSavedMsg(null);
    try {
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          errorReviewRequiredStreak: Math.max(1, errorStreak),
          minAnswersForTopicPercent: Math.max(1, minTopicAnswers),
        }),
      });
      if (res.ok) {
        setSettingsSavedMsg('Configurações salvas com sucesso.');
        void loadSettings();
      }
    } finally {
      setSavingSettings(false);
    }
  };

  const handleFileSelect = async (file: File) => {
    setImportMessage(null);
    const text = await file.text();
    setPendingRawJson(text);
    setPendingFilename(file.name);

    const res = await fetch('/api/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rawText: text, filename: file.name, dryRun: true }),
    });
    const payload = (await res.json()) as { report: ImportValidationReport };
    setDryRunReport(payload.report);
  };

  const handleConfirmImport = async () => {
    if (!pendingRawJson) return;
    setImporting(true);
    setImportMessage(null);
    try {
      const res = await fetch('/api/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rawText: pendingRawJson,
          filename: pendingFilename,
          dryRun: false,
        }),
      });
      const payload = (await res.json()) as { report: ImportValidationReport; error?: string };
      if (!res.ok) {
        throw new Error(payload.error || 'Falha na importação.');
      }
      setImportMessage(
        `Importação concluída: ${payload.report.importedCount} nova(s), ${payload.report.updatedCount} atualizada(s), ${payload.report.skippedCount} ignorada(s). Seu histórico de estudos foi preservado.`
      );
      setPendingRawJson(null);
      setDryRunReport(null);
      void loadSettings();
    } catch (err) {
      setImportMessage(err instanceof Error ? err.message : 'Erro na importação.');
    } finally {
      setImporting(false);
    }
  };

  const handleUploadQuestionImage = async (codigo: string, file: File) => {
    setUploadingCodigo(codigo);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch(`/api/questions/${encodeURIComponent(codigo)}/image`, {
        method: 'POST',
        body: fd,
      });
      if (res.ok) {
        void loadSettings();
      }
    } finally {
      setUploadingCodigo(null);
    }
  };

  if (loading || !data) {
    return <div className="h-96 bg-white border border-zinc-200 rounded-2xl animate-pulse" />;
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-950">
          Configurações e Administração
        </h1>
        <p className="text-sm text-zinc-500 mt-1">
          Gerencie o banco original (Camada 1), parâmetros de revisão e exportação separada dos
          seus dados pessoais de aprendizagem (Camada 2).
        </p>
      </div>

      {/* 0. Professor Flutuante (App Android) */}
      {androidState && (
        <section
          id="android-professor-settings-card"
          className="bg-white rounded-2xl border border-indigo-200/90 p-5 sm:p-6 space-y-4 shadow-xs"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Smartphone className="w-4 h-4 text-indigo-600" />
              <h2 className="text-base font-semibold text-zinc-950">
                Professor Flutuante na Tela (Android)
              </h2>
            </div>
            <span
              className={
                androidState.enabled
                  ? 'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200'
                  : 'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-zinc-100 text-zinc-600 border border-zinc-200'
              }
            >
              {androidState.enabled ? 'Ativado sobre outros apps' : 'Desativado'}
            </span>
          </div>

          <p className="text-xs text-zinc-600 leading-relaxed">
            Mantém o Prof. IREB flutuando sobre qualquer aplicativo do celular. Se você ficar{' '}
            <strong>{Math.round(androidWindow / 60)}h</strong> sem responder pelo menos{' '}
            <strong>{androidTarget} questões</strong>, ele começa a se estressar — basta tocar nele
            para abrir o modo estudo.
          </p>

          <button
            type="button"
            onClick={handleToggleAndroidOverlay}
            className={
              androidState.enabled
                ? 'w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-rose-600 text-white text-xs font-semibold hover:bg-rose-700 transition-colors'
                : 'w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 transition-colors'
            }
          >
            {androidState.enabled
              ? 'Desativar Professor Flutuante'
              : 'Ativar Professor Flutuante na Tela'}
          </button>

          <div className="grid grid-cols-2 gap-3 pt-2 border-t border-zinc-100">
            <label className="space-y-1">
              <span className="block text-[11px] font-medium text-zinc-600">
                Meta de questões
              </span>
              <input
                type="number"
                min={1}
                max={100}
                value={androidTarget}
                onChange={(e) => setAndroidTarget(Number(e.target.value) || 10)}
                className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm text-zinc-900"
              />
            </label>
            <label className="space-y-1">
              <span className="block text-[11px] font-medium text-zinc-600">
                Janela (min — 120 = 2h)
              </span>
              <input
                type="number"
                min={5}
                max={720}
                value={androidWindow}
                onChange={(e) => setAndroidWindow(Number(e.target.value) || 120)}
                className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm text-zinc-900"
              />
            </label>
          </div>

          <label className="flex items-center gap-2.5 text-xs text-zinc-700 cursor-pointer">
            <input
              type="checkbox"
              checked={androidTestStress}
              onChange={(e) => setAndroidTestStress(e.target.checked)}
              className="rounded border-zinc-300 text-indigo-600"
            />
            Testar modo estressado agora (simula 2h sem estudar)
          </label>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleSaveAndroidOverlaySettings}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-zinc-900 text-white text-xs font-medium hover:bg-zinc-800"
            >
              <Save className="w-3.5 h-3.5" />
              Salvar regras do Professor
            </button>
            {androidSavedMsg && (
              <span className="text-xs text-emerald-700 font-medium">{androidSavedMsg}</span>
            )}
          </div>
        </section>
      )}

      {/* 1. Saúde do Banco de Questões */}
      <section className="bg-white rounded-2xl border border-zinc-200/90 p-5 sm:p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Database className="w-4 h-4 text-zinc-500" />
          <h2 className="text-base font-semibold text-zinc-950">
            Banco de Questões (Camada 1 — Origem)
          </h2>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <div className="rounded-xl bg-zinc-50 border border-zinc-200/80 p-3.5">
            <div className="text-[11px] text-zinc-500">Total importado</div>
            <div className="text-lg font-semibold text-zinc-950">
              {data.bankSummary.totalQuestions}
            </div>
          </div>
          <div className="rounded-xl bg-zinc-50 border border-zinc-200/80 p-3.5">
            <div className="text-[11px] text-zinc-500">Resposta única</div>
            <div className="text-lg font-semibold text-zinc-950">
              {data.bankSummary.unicaCount}
            </div>
          </div>
          <div className="rounded-xl bg-zinc-50 border border-zinc-200/80 p-3.5">
            <div className="text-[11px] text-zinc-500">Múltipla resposta</div>
            <div className="text-lg font-semibold text-zinc-950">
              {data.bankSummary.multiplaCount}
            </div>
          </div>
          <div className="rounded-xl bg-zinc-50 border border-zinc-200/80 p-3.5">
            <div className="text-[11px] text-zinc-500">Com imagem</div>
            <div className="text-lg font-semibold text-zinc-950">
              {data.bankSummary.withImageCount}
            </div>
          </div>
          <div className="rounded-xl bg-zinc-50 border border-zinc-200/80 p-3.5">
            <div className="text-[11px] text-zinc-500">Imagens ausentes</div>
            <div className="text-lg font-semibold text-zinc-950">
              {data.bankSummary.missingImageCount}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-3 pt-2">
          <a
            href="/api/export?type=original"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-zinc-200 text-xs font-medium text-zinc-800 hover:bg-zinc-50"
          >
            <Download className="w-3.5 h-3.5" />
            Exportar JSON original (Camada 1)
          </a>
          <a
            href="/api/export?type=history"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-zinc-200 text-xs font-medium text-zinc-800 hover:bg-zinc-50"
          >
            <Download className="w-3.5 h-3.5" />
            Exportar histórico de estudos (Camada 2)
          </a>
        </div>
      </section>

      {/* 1.5. Status da IA do Professor (Gemini 3.1) */}
      <section className="bg-white rounded-2xl border border-zinc-200/90 p-5 sm:p-6 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-indigo-600" />
            <h2 className="text-base font-semibold text-zinc-950">
              Professor IREB com IA (Gemini 3.1)
            </h2>
          </div>
          <span
            className={
              data.bankSummary.geminiConfigured
                ? 'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200'
                : 'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-50 text-amber-800 border border-amber-200'
            }
          >
            {data.bankSummary.geminiConfigured ? 'Gemini 3.1 conectado' : 'GEMINI_API_KEY pendente'}
          </span>
        </div>

        <p className="text-xs text-zinc-600 leading-relaxed">
          Modelo configurado:{' '}
          <code className="font-mono bg-zinc-100 px-1.5 py-0.5 rounded text-zinc-800">
            {data.bankSummary.geminiModel ?? 'gemini-3.1-flash-lite-preview'}
          </code>
          {' • '}Skill pedagógica:{' '}
          <code className="font-mono bg-zinc-100 px-1.5 py-0.5 rounded text-zinc-800">
            prompts/professor-ireb.skill.md
          </code>
          .{' '}
          {data.bankSummary.geminiConfigured
            ? 'O Professor IREB está pronto para dar dicas focadas em pontos-chave (sem spoiler) e responder dúvidas no Modo Estudo.'
            : 'Adicione GEMINI_API_KEY=sua_chave no arquivo .env.local na raiz do projeto (veja .env.example) e reinicie o servidor Next.js.'}
        </p>
      </section>

      {/* 2. Importar versão atualizada do JSON */}
      <section className="bg-white rounded-2xl border border-zinc-200/90 p-5 sm:p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Upload className="w-4 h-4 text-zinc-500" />
          <h2 className="text-base font-semibold text-zinc-950">
            Importar / atualizar questoes.json
          </h2>
        </div>
        <p className="text-xs text-zinc-500 leading-relaxed">
          Atualize o banco com uma nova versão do <code className="font-mono">questoes.json</code>.
          O sistema valida toda a estrutura antes de gravar, identifica duplicidades/inconsistências
          sem alterá-las automaticamente e preserva integralmente suas tentativas, favoritos e
          anotações.
        </p>

        <label className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-dashed border-zinc-300 bg-zinc-50 hover:bg-zinc-100 cursor-pointer text-xs font-medium text-zinc-700 transition-colors">
          <Upload className="w-4 h-4" />
          Selecionar arquivo JSON para validar
          <input
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleFileSelect(file);
            }}
          />
        </label>

        {dryRunReport && (
          <div className="rounded-xl border border-zinc-200 bg-zinc-50/70 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-xs font-semibold text-zinc-900">
                Pré-validação: {dryRunReport.sourceFilename}
              </div>
              <span className="text-xs font-mono text-zinc-600">
                {dryRunReport.totalInFile} registro(s)
              </span>
            </div>

            {dryRunReport.issues.length > 0 ? (
              <div className="space-y-1.5">
                {dryRunReport.issues.map((issue, idx) => (
                  <div
                    key={idx}
                    className="flex items-start gap-2 text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2"
                  >
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                    <span>{issue.message}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex items-center gap-2 text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                Nenhuma inconsistência encontrada na estrutura, gabaritos ou imagens.
              </div>
            )}

            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                disabled={!dryRunReport.valid || importing}
                onClick={handleConfirmImport}
                className="px-4 py-2 rounded-lg bg-zinc-900 text-white text-xs font-medium hover:bg-zinc-800 disabled:opacity-40"
              >
                {importing ? 'Importando...' : 'Confirmar importação segura'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setDryRunReport(null);
                  setPendingRawJson(null);
                }}
                className="px-3 py-2 rounded-lg text-xs text-zinc-600 hover:bg-zinc-200/70"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}

        {importMessage && (
          <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-xs text-emerald-900">
            {importMessage}
          </div>
        )}
      </section>

      {/* 3. Gestão de Imagens */}
      <section className="bg-white rounded-2xl border border-zinc-200/90 p-5 sm:p-6 space-y-4">
        <div className="flex items-center gap-2">
          <ImageIcon className="w-4 h-4 text-zinc-500" />
          <h2 className="text-base font-semibold text-zinc-950">
            Imagens associadas às questões ({data.questionsWithImages.length})
          </h2>
        </div>

        <div className="space-y-3">
          {data.questionsWithImages.map((q) => (
            <div
              key={q.codigo}
              className="rounded-xl border border-zinc-200/80 p-4 flex flex-wrap items-center justify-between gap-4"
            >
              <div className="flex items-center gap-3 min-w-0">
                {q.managedImageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={q.managedImageUrl}
                    alt={q.codigo}
                    className="w-16 h-12 object-cover rounded-lg border border-zinc-200 shrink-0"
                  />
                ) : (
                  <div className="w-16 h-12 rounded-lg bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600 shrink-0">
                    <AlertTriangle className="w-4 h-4" />
                  </div>
                )}
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-zinc-900">
                    #{String(q.numero).padStart(2, '0')} • {q.codigo}
                  </div>
                  <div className="text-[11px] text-zinc-500 truncate max-w-md">
                    Metadado original: {q.imagem || '—'}
                  </div>
                </div>
              </div>

              <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-200 text-xs font-medium text-zinc-700 hover:bg-zinc-50 cursor-pointer">
                <Upload className="w-3.5 h-3.5" />
                {uploadingCodigo === q.codigo ? 'Enviando...' : 'Substituir imagem'}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void handleUploadQuestionImage(q.codigo, f);
                  }}
                />
              </label>
            </div>
          ))}
        </div>
      </section>

      {/* 4. Parâmetros de Revisão e Relatórios */}
      <section className="bg-white rounded-2xl border border-zinc-200/90 p-5 sm:p-6 space-y-4">
        <h2 className="text-base font-semibold text-zinc-950">Parâmetros de aprendizagem</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-zinc-700 mb-1.5">
              Acertos consecutivos para sair da fila de erros
            </label>
            <input
              type="number"
              min={1}
              max={5}
              value={errorStreak}
              onChange={(e) => setErrorStreak(Number(e.target.value))}
              className="w-28 rounded-xl border border-zinc-200 px-3 py-2 text-sm text-zinc-900"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-700 mb-1.5">
              Mínimo de respostas para exibir % por assunto
            </label>
            <input
              type="number"
              min={1}
              max={10}
              value={minTopicAnswers}
              onChange={(e) => setMinTopicAnswers(Number(e.target.value))}
              className="w-28 rounded-xl border border-zinc-200 px-3 py-2 text-sm text-zinc-900"
            />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            disabled={savingSettings}
            onClick={handleSaveSettings}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-zinc-900 text-white text-xs font-medium hover:bg-zinc-800 disabled:opacity-50"
          >
            <Save className="w-3.5 h-3.5" />
            {savingSettings ? 'Salvando...' : 'Salvar parâmetros'}
          </button>
          {settingsSavedMsg && (
            <span className="text-xs text-emerald-700 font-medium">{settingsSavedMsg}</span>
          )}
        </div>
      </section>

      {/* 5. Log de importações */}
      <section className="bg-white rounded-2xl border border-zinc-200/90 p-5 sm:p-6 space-y-3">
        <h2 className="text-base font-semibold text-zinc-950">Histórico de importações</h2>
        <div className="divide-y divide-zinc-100 text-xs">
          {data.imports.map((log) => (
            <div key={log.id} className="py-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <span className="font-medium text-zinc-900">{log.sourceFilename}</span>
                <span className="text-zinc-500 ml-2">{formatDateBR(log.importedAt)}</span>
              </div>
              <div className="text-zinc-600 font-mono">
                {log.totalQuestions} questões • {log.report.issues.length} alerta(s)
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

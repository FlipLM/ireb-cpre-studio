'use client';

import { useState } from 'react';
import { Check, Edit3, Plus, StickyNote, Trash2, X } from 'lucide-react';
import { formatDateBR } from '@/lib/utils';
import type { NoteRecord } from '@/types/domain';

interface QuestionNotesPanelProps {
  questionCodigo: string;
  notes: NoteRecord[];
  onNotesChange: (nextNotes: NoteRecord[]) => void;
}

export function QuestionNotesPanel({
  questionCodigo,
  notes,
  onNotesChange,
}: QuestionNotesPanelProps) {
  const [newContent, setNewContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingContent, setEditingContent] = useState('');

  const handleCreate = async () => {
    if (!newContent.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/questions/${encodeURIComponent(questionCodigo)}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: newContent }),
      });
      if (res.ok) {
        const data = (await res.json()) as { note: NoteRecord };
        onNotesChange([data.note, ...notes]);
        setNewContent('');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleSaveEdit = async (id: number) => {
    if (!editingContent.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/questions/${encodeURIComponent(questionCodigo)}/notes`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, content: editingContent }),
      });
      if (res.ok) {
        const data = (await res.json()) as { note: NoteRecord };
        onNotesChange(notes.map((n) => (n.id === id ? data.note : n)));
        setEditingId(null);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    const res = await fetch(
      `/api/questions/${encodeURIComponent(questionCodigo)}/notes?id=${id}`,
      { method: 'DELETE' }
    );
    if (res.ok) {
      onNotesChange(notes.filter((n) => n.id !== id));
    }
  };

  return (
    <section className="bg-white rounded-2xl border border-zinc-200/90 p-5 sm:p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <StickyNote className="w-4 h-4 text-zinc-500" />
          <h3 className="text-sm font-semibold text-zinc-900">
            Anotações pessoais ({notes.length})
          </h3>
        </div>
        <span className="text-xs text-zinc-400">Salvo separadamente do JSON original</span>
      </div>

      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row gap-2">
          <textarea
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            rows={2}
            placeholder="Registre um conceito para memorizar, dúvida sobre uma alternativa ou resumo pessoal..."
            className="flex-1 rounded-xl border border-zinc-200 bg-zinc-50/50 px-3.5 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:bg-white transition-all resize-y"
          />
          <button
            type="button"
            disabled={saving || !newContent.trim()}
            onClick={handleCreate}
            className="sm:self-end inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
          >
            <Plus className="w-4 h-4" />
            Adicionar
          </button>
        </div>

        {notes.length > 0 && (
          <div className="space-y-2.5 pt-2">
            {notes.map((note) => (
              <div
                key={note.id}
                className="rounded-xl border border-zinc-200/80 bg-zinc-50/60 p-3.5"
              >
                {editingId === note.id ? (
                  <div className="space-y-2">
                    <textarea
                      value={editingContent}
                      onChange={(e) => setEditingContent(e.target.value)}
                      rows={3}
                      className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                    />
                    <div className="flex items-center gap-2 justify-end">
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-zinc-600 hover:bg-zinc-200/70"
                      >
                        <X className="w-3.5 h-3.5" />
                        Cancelar
                      </button>
                      <button
                        type="button"
                        disabled={saving || !editingContent.trim()}
                        onClick={() => handleSaveEdit(note.id)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-900 text-white hover:bg-zinc-800"
                      >
                        <Check className="w-3.5 h-3.5" />
                        Salvar
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="text-sm text-zinc-800 whitespace-pre-line leading-relaxed">
                      {note.content}
                    </p>
                    <div className="mt-2.5 flex items-center justify-between text-[11px] text-zinc-400">
                      <span>Atualizada em {formatDateBR(note.updatedAt)}</span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingId(note.id);
                            setEditingContent(note.content);
                          }}
                          className="p-1 rounded hover:bg-zinc-200/70 text-zinc-500 hover:text-zinc-900"
                          title="Editar anotação"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(note.id)}
                          className="p-1 rounded hover:bg-rose-100 text-zinc-500 hover:text-rose-700"
                          title="Excluir anotação"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

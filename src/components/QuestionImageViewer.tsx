'use client';

import { useState } from 'react';
import { AlertTriangle, Maximize2, X } from 'lucide-react';

interface QuestionImageViewerProps {
  codigo: string;
  managedImageUrl: string | null;
  originalImagePath: string | null;
  imageMissing: boolean;
}

export function QuestionImageViewer({
  codigo,
  managedImageUrl,
  originalImagePath,
  imageMissing,
}: QuestionImageViewerProps) {
  const [zoomed, setZoomed] = useState(false);

  if (!managedImageUrl && !imageMissing) {
    return null;
  }

  if (imageMissing && !managedImageUrl) {
    return (
      <div className="my-5 rounded-xl border border-amber-200 bg-amber-50/70 p-4 flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
        <div className="text-sm text-amber-900">
          <p className="font-medium">Imagem associada ao enunciado não localizada</p>
          <p className="text-xs text-amber-800/90 mt-1">
            Referência original preservada:{' '}
            <code className="font-mono bg-amber-100/80 px-1.5 py-0.5 rounded">
              {originalImagePath}
            </code>
          </p>
          <p className="text-xs text-amber-800/80 mt-1">
            Você pode associar ou enviar a imagem correspondente na página de Configurações sem
            alterar o banco original.
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      <figure className="my-5 rounded-xl border border-zinc-200 bg-zinc-50/70 p-3 sm:p-4">
        <div className="flex items-center justify-between mb-2.5">
          <span className="text-xs font-medium text-zinc-500">
            Figura da questão ({codigo})
          </span>
          <button
            type="button"
            onClick={() => setZoomed(true)}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-600 hover:text-zinc-900 px-2 py-1 rounded-md hover:bg-zinc-200/60 transition-colors"
          >
            <Maximize2 className="w-3.5 h-3.5" />
            Ampliar
          </button>
        </div>
        <div className="bg-white rounded-lg border border-zinc-200/80 p-2 flex justify-center overflow-x-auto">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={managedImageUrl!}
            alt={`Diagrama ou tabela da questão ${codigo}`}
            onClick={() => setZoomed(true)}
            className="max-h-[420px] w-auto object-contain cursor-zoom-in rounded"
          />
        </div>
      </figure>

      {zoomed && (
        <div
          className="fixed inset-0 z-50 bg-zinc-950/80 backdrop-blur-xs flex items-center justify-center p-4 sm:p-8"
          onClick={() => setZoomed(false)}
        >
          <div
            className="relative max-w-5xl w-full max-h-[90vh] bg-white rounded-2xl p-4 shadow-2xl flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-zinc-200">
              <span className="text-sm font-medium text-zinc-800">
                Visualização ampliada — {codigo}
              </span>
              <button
                type="button"
                onClick={() => setZoomed(false)}
                className="p-1.5 rounded-lg text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
                aria-label="Fechar ampliação"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-auto flex items-center justify-center bg-zinc-50 rounded-xl p-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={managedImageUrl!}
                alt={`Diagrama ampliado da questão ${codigo}`}
                className="max-w-full max-h-[75vh] object-contain"
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}

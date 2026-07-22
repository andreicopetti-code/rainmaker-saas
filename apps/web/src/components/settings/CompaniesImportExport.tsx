'use client';

import { useCallback, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  exportContatos,
  exportNegociacoes,
  importContatos,
  importNegociacoes,
  type ExportPayload,
  type ImportMode,
} from '@/app/configuracoes/import-export-actions';

type ImportTarget = 'negociacoes' | 'contatos';

type ConfirmState = {
  count: number;
  target: ImportTarget;
  fileText: string;
  filename: string;
};

function downloadPayload({ content, filename, mime }: ExportPayload) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function CompaniesImportExport() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [toast, setToast] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [importTarget, setImportTarget] = useState<ImportTarget>('negociacoes');

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2800);
  }, []);

  function handleExport(kind: 'negociacoes' | 'contatos', format: 'json' | 'csv') {
    startTransition(async () => {
      try {
        const payload = kind === 'negociacoes'
          ? await exportNegociacoes(format)
          : await exportContatos(format);
        downloadPayload(payload);
        showToast(kind === 'negociacoes' ? 'Negociações exportadas!' : 'Contatos exportados!');
      } catch (err) {
        alert(err instanceof Error ? err.message : 'Erro ao exportar');
      }
    });
  }

  function triggerImport(target: ImportTarget) {
    setImportTarget(target);
    fileRef.current?.click();
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? '');
      try {
        const isCsv = file.name.toLowerCase().endsWith('.csv');
        let count = 0;
        if (isCsv) {
          count = Math.max(0, text.split('\n').filter((l) => l.trim()).length - 1);
        } else {
          const parsed = JSON.parse(text) as { cards?: unknown[]; contatos?: unknown[] } | unknown[];
          count = Array.isArray(parsed)
            ? parsed.length
            : (parsed.cards ?? parsed.contatos ?? []).length;
        }
        if (!count) {
          showToast('Nenhum registro encontrado no arquivo.');
          return;
        }
        setConfirm({ count, target: importTarget, fileText: text, filename: file.name });
      } catch {
        showToast('Erro ao ler arquivo.');
      }
    };
    reader.readAsText(file);
  }

  function runImport(mode: ImportMode) {
    if (!confirm) return;
    const { fileText, filename, target, count } = confirm;
    setConfirm(null);

    startTransition(async () => {
      try {
        const fn = target === 'negociacoes' ? importNegociacoes : importContatos;
        const result = await fn(fileText, filename, mode);
        router.refresh();
        if (mode === 'replace') {
          showToast(`${result.imported} registro(s) importado(s) com sucesso!`);
        } else {
          showToast(
            `${result.imported} adicionado(s)${result.skipped ? ` · ${result.skipped} já existente(s)` : ''}`,
          );
        }
      } catch (err) {
        alert(err instanceof Error ? err.message : 'Erro ao importar');
      }
    });
  }

  return (
    <>
      <div className="settings-section settings-right">
        <div className="settings-section-header">
          <div>
            <div className="settings-section-title">Importação e Exportação de Dados</div>
            <div className="settings-section-desc">
              Faça backup ou restaure negociações e contatos (empresas). Importações JSON/CSV permitem
              substituir todos os dados ou mesclar apenas registros novos — como no legado original.
            </div>
          </div>
        </div>

        <div className="settings-section-body">
          <div className="impexp-grid">
            <div className="impexp-card">
              <div className="impexp-card-title">Negociações (Funil)</div>
              <div className="impexp-card-desc">
                Todos os cards do funil com dados de empresa, contato, etapa e valor.
              </div>
              <div className="impexp-actions">
                <button type="button" className="btn-export" disabled={pending} onClick={() => handleExport('negociacoes', 'json')}>
                  ⬇ JSON
                </button>
                <button type="button" className="btn-export" disabled={pending} onClick={() => handleExport('negociacoes', 'csv')}>
                  ⬇ CSV
                </button>
                <button type="button" className="btn-import-lbl" disabled={pending} onClick={() => triggerImport('negociacoes')}>
                  ⬆ Importar
                </button>
              </div>
            </div>

            <div className="impexp-card">
              <div className="impexp-card-title">Contatos (Empresas)</div>
              <div className="impexp-card-desc">
                Lista de contatos PJ/PF com CNPJ/CPF, telefone, e-mail e município.
              </div>
              <div className="impexp-actions">
                <button type="button" className="btn-export" disabled={pending} onClick={() => handleExport('contatos', 'json')}>
                  ⬇ JSON
                </button>
                <button type="button" className="btn-export" disabled={pending} onClick={() => handleExport('contatos', 'csv')}>
                  ⬇ CSV
                </button>
                <button type="button" className="btn-import-lbl" disabled={pending} onClick={() => triggerImport('contatos')}>
                  ⬆ Importar
                </button>
              </div>
            </div>
          </div>

          <p className="impexp-hint">
            Colunas CSV: id, tipo, razao_social, nome_fantasia, cnpj, cpf, contato, telefone, email,
            municipio, uf, valor, etapa, observacao.
          </p>
        </div>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept=".json,.csv"
        className="impexp-file-input"
        onChange={handleFileChange}
      />

      {confirm ? (
        <div className="settings-confirm-overlay" role="dialog" aria-modal="true">
          <div className="settings-confirm-box">
            <p>
              Importar <strong>{confirm.count}</strong> registro(s)?
              <br /><br />
              <strong>Substituir</strong> apaga os deals atuais do funil e importa o arquivo.
              <br />
              <strong>Mesclar</strong> adiciona apenas registros com ID ainda não existente.
            </p>
            <div className="settings-confirm-actions">
              <button type="button" className="btn-ghost" onClick={() => setConfirm(null)}>Cancelar</button>
              <button type="button" className="btn-ghost" disabled={pending} onClick={() => runImport('merge')}>Mesclar</button>
              <button type="button" className="btn-danger" disabled={pending} onClick={() => runImport('replace')}>Substituir</button>
            </div>
          </div>
        </div>
      ) : null}

      {toast ? <div className="settings-toast">{toast}</div> : null}
    </>
  );
}

import { useCallback, useEffect, useId, useRef, useState } from 'react';

import type { ActiveExamPort, ActiveExamState, PackagePort, PackageSummary } from './ports';
import { useModalDialog } from './useModalDialog';

type PackageAction = 'download' | 'update' | 'remove' | 'select';
type FocusTarget =
  | { kind: 'heading'; packageId: string }
  | { kind: 'remove'; packageId: string }
  | { kind: 'cancel'; packageId: string }
  | { kind: 'message' }
  | { kind: 'panel-title' };

interface Props {
  packagePort: PackagePort;
  activeExamPort: ActiveExamPort;
  online: boolean;
  onClose: () => void;
  onContentChange: () => Promise<void>;
}

const actionLabels: Record<PackageAction, string> = {
  download: 'Baixando…',
  update: 'Atualizando…',
  remove: 'Removendo…',
  select: 'Selecionando…',
};

function formatBytes(byteSize: number) {
  if (byteSize < 1_000_000) return `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(byteSize / 1_000)} kB`;
  return `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(byteSize / 1_000_000)} MB`;
}

function errorMessage(action: PackageAction, item: PackageSummary, error: unknown) {
  const verbs: Record<PackageAction, string> = {
    download: 'baixar',
    update: 'atualizar',
    remove: 'remover',
    select: 'selecionar',
  };
  const detail = error instanceof Error ? error.message : String(error);
  return `Não foi possível ${verbs[action]} ${item.label}. Tente novamente. ${detail}`;
}

export function ExamsPanel({ packagePort, activeExamPort, online, onClose, onContentChange }: Props) {
  const dialogRef = useModalDialog(onClose);
  const idPrefix = useId().replaceAll(':', '');
  const panelTitleRef = useRef<HTMLHeadingElement>(null);
  const messageRef = useRef<HTMLParagraphElement>(null);
  const headingRefs = useRef(new Map<string, HTMLHeadingElement>());
  const removeRefs = useRef(new Map<string, HTMLButtonElement>());
  const cancelRefs = useRef(new Map<string, HTMLButtonElement>());
  const [packages, setPackages] = useState<PackageSummary[]>([]);
  const [activeExam, setActiveExam] = useState<ActiveExamState | null>(null);
  const [loading, setLoading] = useState(true);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [busy, setBusy] = useState<Record<string, PackageAction>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [pendingRemoval, setPendingRemoval] = useState<string | null>(null);
  const [focusTarget, setFocusTarget] = useState<FocusTarget | null>(null);

  const refresh = useCallback(async () => {
    const nextPackages = await packagePort.list();
    const nextActive = await activeExamPort.initialize();
    setPackages(nextPackages);
    setActiveExam(nextActive);
    return { nextPackages, nextActive };
  }, [activeExamPort, packagePort]);

  useEffect(() => {
    let current = true;
    setLoading(true);
    setCatalogError(null);
    void refresh().catch((error: unknown) => {
      if (current) setCatalogError(error instanceof Error ? error.message : String(error));
    }).finally(() => {
      if (current) setLoading(false);
    });
    return () => { current = false; };
  }, [refresh]);

  useEffect(() => {
    if (!focusTarget) return;
    const target = focusTarget.kind === 'heading' ? headingRefs.current.get(focusTarget.packageId)
      : focusTarget.kind === 'remove' ? removeRefs.current.get(focusTarget.packageId)
        : focusTarget.kind === 'cancel' ? cancelRefs.current.get(focusTarget.packageId)
          : focusTarget.kind === 'message' ? messageRef.current
            : panelTitleRef.current;
    target?.focus();
    setFocusTarget(null);
  }, [focusTarget, message, packages, pendingRemoval]);

  const startAction = (item: PackageSummary, action: PackageAction) => {
    setBusy((current) => ({ ...current, [item.id]: action }));
    setErrors((current) => {
      const next = { ...current };
      delete next[item.id];
      return next;
    });
    setMessage(null);
  };

  const finishAction = (item: PackageSummary) => {
    setBusy((current) => {
      const next = { ...current };
      delete next[item.id];
      return next;
    });
  };

  const failAction = (item: PackageSummary, action: PackageAction, error: unknown) => {
    setErrors((current) => ({ ...current, [item.id]: errorMessage(action, item, error) }));
  };

  const install = async (item: PackageSummary) => {
    const action = item.state === 'update-available' ? 'update' : 'download';
    if (!online) {
      setErrors((current) => ({ ...current, [item.id]: `Conecte-se à internet para ${action === 'update' ? 'atualizar' : 'baixar'} ${item.label}.` }));
      return;
    }
    startAction(item, action);
    try {
      await packagePort.install(item.id);
      const { nextActive } = await refresh();
      await onContentChange();
      const remainsActive = nextActive.status === 'active' && nextActive.packageId === item.id;
      setMessage(action === 'update'
        ? `${item.label} foi atualizada${remainsActive ? ' e continua ativa' : ''}.`
        : `${item.label} foi baixada${remainsActive ? ' e definida como prova ativa' : ''}.`);
      setFocusTarget({ kind: 'heading', packageId: item.id });
    } catch (error) {
      failAction(item, action, error);
    } finally {
      finishAction(item);
    }
  };

  const select = async (item: PackageSummary) => {
    if (item.state === 'available') return;
    startAction(item, 'select');
    try {
      const nextActive = await activeExamPort.select(item.id, item.editionId);
      setActiveExam(nextActive);
      await onContentChange();
      setMessage(`${item.label} é sua prova ativa.`);
      setFocusTarget({ kind: 'heading', packageId: item.id });
    } catch (error) {
      failAction(item, 'select', error);
    } finally {
      finishAction(item);
    }
  };

  const remove = async (item: PackageSummary) => {
    const removedActive = activeExam?.status === 'active' && activeExam.packageId === item.id;
    const removedIndex = packages.findIndex(({ id }) => id === item.id);
    startAction(item, 'remove');
    try {
      await packagePort.remove(item.id);
      const { nextPackages, nextActive } = await refresh();
      await onContentChange();
      setPendingRemoval(null);
      if (removedActive && nextActive.status === 'selection-required') {
        setMessage(`${item.label} foi removida. Escolha outra prova para continuar.`);
        setFocusTarget({ kind: 'message' });
      } else if (removedActive && nextActive.status === 'empty') {
        setMessage(`${item.label} foi removida. Baixe uma prova para começar a estudar.`);
        setFocusTarget({ kind: 'message' });
      } else {
        const active = nextActive.status === 'active'
          ? nextPackages.find(({ id }) => id === nextActive.packageId)?.label
          : null;
        setMessage(`${item.label} foi removida.${active ? ` Sua prova ativa continua sendo ${active}.` : ''}`);
        const nextPackage = nextPackages[Math.min(removedIndex, nextPackages.length - 1)];
        setFocusTarget(nextPackage ? { kind: 'heading', packageId: nextPackage.id } : { kind: 'panel-title' });
      }
    } catch (error) {
      setPendingRemoval(null);
      failAction(item, 'remove', error);
      setFocusTarget({ kind: 'remove', packageId: item.id });
    } finally {
      finishAction(item);
    }
  };

  const activeLabel = activeExam?.status === 'active'
    ? packages.find(({ id, editionId }) => id === activeExam.packageId && editionId === activeExam.editionId)?.label
    : null;

  return (
    <section ref={dialogRef} className="exams-panel" role="dialog" aria-modal="true" aria-labelledby={`${idPrefix}-title`} tabIndex={-1}>
      <div className="exams-heading">
        <div><span className="eyebrow">Sua biblioteca offline</span><h2 id={`${idPrefix}-title`} ref={panelTitleRef} tabIndex={-1}>Provas</h2></div>
        <button className="icon-button" onClick={onClose} aria-label="Fechar provas" data-autofocus>×</button>
      </div>
      <p className="exams-intro">Baixe edições para levar no dispositivo e escolha, separadamente, qual deseja estudar.</p>

      {activeExam && <p className={`active-exam-note active-exam-note--${activeExam.status}`} role="status">
        {activeExam.status === 'active' && <>Prova ativa: <strong>{activeLabel ?? activeExam.editionId}</strong></>}
        {activeExam.status === 'selection-required' && <>Escolha uma prova baixada para continuar estudando.</>}
        {activeExam.status === 'empty' && <>Baixe uma prova para começar a estudar.</>}
      </p>}
      {!online && <p className="exams-offline-note">Você está offline. Provas baixadas continuam disponíveis; novos downloads e atualizações aguardam conexão.</p>}
      {message && <p ref={messageRef} className="exam-message" role="status" tabIndex={-1}>{message}</p>}
      {catalogError && <div className="exam-catalog-error" role="alert">
        <p>Não foi possível carregar as provas: {catalogError}</p>
        <button className="secondary-button" type="button" onClick={() => {
          setLoading(true);
          setCatalogError(null);
          void refresh().catch((error: unknown) => setCatalogError(error instanceof Error ? error.message : String(error))).finally(() => setLoading(false));
        }}>Tentar novamente</button>
      </div>}
      {loading && <p className="exam-loading" role="status">Carregando provas…</p>}

      {!loading && !catalogError && <ul className="exam-list">
        {packages.map((item, index) => {
          const titleId = `${idPrefix}-exam-${index}`;
          const itemBusy = busy[item.id];
          const isInstalled = item.state !== 'available';
          const isActive = activeExam?.status === 'active' && activeExam.packageId === item.id && activeExam.editionId === item.editionId;
          return <li key={item.id}>
            <article className={`exam-card${isActive ? ' exam-card--active' : ''}`} aria-labelledby={titleId} aria-busy={Boolean(itemBusy)}>
              <div className="exam-card-topline">
                <span className="exam-number" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
                <div className="exam-states" aria-label={`Estado de ${item.label}`}>
                  <span>{item.state === 'available' ? 'Disponível' : item.state === 'downloaded' ? 'Baixada' : 'Atualização disponível'}</span>
                  {isActive && <strong>Ativa</strong>}
                </div>
              </div>
              <h3 id={titleId} ref={(node) => { if (node) headingRefs.current.set(item.id, node); else headingRefs.current.delete(item.id); }} tabIndex={-1}>{item.label}</h3>
              <dl className="exam-details">
                <div><dt>Ano</dt><dd>{item.year ?? 'Não informado'}</dd></div>
                <div><dt>Questões</dt><dd>{new Intl.NumberFormat('pt-BR').format(item.questionCount)}</dd></div>
                <div><dt>Tamanho</dt><dd>{formatBytes(item.byteSize)}</dd></div>
              </dl>

              {errors[item.id] && <p className="exam-error" role="alert">{errors[item.id]}</p>}

              {pendingRemoval === item.id ? <div className="remove-confirmation" role="alertdialog" aria-labelledby={`${titleId}-remove-title`}>
                <p id={`${titleId}-remove-title`}><strong>Remover {item.label} do dispositivo?</strong> Seu progresso será preservado.</p>
                <div className="exam-actions">
                  <button ref={(node) => { if (node) cancelRefs.current.set(item.id, node); else cancelRefs.current.delete(item.id); }} className="secondary-button" type="button" disabled={Boolean(itemBusy)} onClick={() => {
                    setPendingRemoval(null);
                    setFocusTarget({ kind: 'remove', packageId: item.id });
                  }}>Cancelar</button>
                  <button className="danger-button" type="button" disabled={Boolean(itemBusy)} onClick={() => void remove(item)}>{itemBusy === 'remove' ? actionLabels.remove : 'Confirmar remoção'}</button>
                </div>
              </div> : <div className="exam-actions">
                {item.state === 'available' && <button className="primary-button" type="button" disabled={Boolean(itemBusy) || !online} aria-label={`Baixar ${item.label}`} onClick={() => void install(item)}>{itemBusy ? actionLabels[itemBusy] : 'Baixar'}</button>}
                {item.state === 'update-available' && <button className="primary-button" type="button" disabled={Boolean(itemBusy) || !online} aria-label={`Atualizar ${item.label}`} onClick={() => void install(item)}>{itemBusy ? actionLabels[itemBusy] : 'Atualizar'}</button>}
                {isInstalled && !isActive && <button className="study-button" type="button" disabled={Boolean(itemBusy)} aria-label={`Estudar ${item.label}`} onClick={() => void select(item)}>{itemBusy ? actionLabels[itemBusy] : 'Estudar esta prova'}</button>}
                {isInstalled && <button ref={(node) => { if (node) removeRefs.current.set(item.id, node); else removeRefs.current.delete(item.id); }} className="text-button" type="button" disabled={Boolean(itemBusy)} aria-label={`Remover ${item.label} do dispositivo`} onClick={() => {
                  setPendingRemoval(item.id);
                  setFocusTarget({ kind: 'cancel', packageId: item.id });
                }}>Remover do dispositivo</button>}
              </div>}
            </article>
          </li>;
        })}
      </ul>}
    </section>
  );
}

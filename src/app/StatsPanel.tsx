import type { Stats, StatsMetrics } from '../contracts';
import { useModalDialog } from './useModalDialog';

const percentage = (value: number | null) => value === null ? '—' : `${Math.round(value * 100)}%`;

const Breakdown = ({ label, items }: { label: string; items: Array<{ id: string; metrics: StatsMetrics }> }) => items.length ? (
  <div className="stats-breakdown">
    <h3>{label}</h3>
    {items.map(({ id, metrics }) => <div className="stats-row" key={id}><span>{id.replaceAll('-', ' ')}</span><span>{metrics.answered} respondidas</span><strong>{percentage(metrics.accuracy)}</strong></div>)}
  </div>
) : null;

export function StatsPanel({ stats, onClose }: { stats: Stats; onClose: () => void }) {
  const metrics = stats.total;
  const dialogRef = useModalDialog(onClose);
  return (
    <section ref={dialogRef} className="stats-panel" role="dialog" aria-modal="true" aria-labelledby="stats-title" tabIndex={-1}>
      <div className="stats-heading">
        <div><span className="eyebrow">Seu ritmo</span><h2 id="stats-title">Estatísticas</h2></div>
        <button className="icon-button" onClick={onClose} aria-label="Fechar estatísticas" data-autofocus>×</button>
      </div>
      <div className="stats-grid">
        <div className="stat stat--accent"><strong>{percentage(metrics.accuracy)}</strong><span>taxa de acerto</span></div>
        <div className="stat"><strong>{metrics.answered}</strong><span>respondidas</span></div>
        <div className="stat"><strong>{metrics.viewed}</strong><span>vistas</span></div>
        <div className="stat"><strong>{metrics.streakDays}</strong><span>dias de sequência</span></div>
        <div className="stat"><strong>{metrics.timedOut}</strong><span>timeouts</span></div>
        <div className="stat"><strong>{metrics.averageTimeMs === null ? '—' : `${Math.round(metrics.averageTimeMs / 1000)}s`}</strong><span>tempo médio</span></div>
      </div>
      <Breakdown label="Por matéria" items={stats.bySubject.map(({ subjectId: id, metrics }) => ({ id, metrics }))} />
      <Breakdown label="Por prova" items={stats.byExam.map(({ examId: id, metrics }) => ({ id, metrics }))} />
    </section>
  );
}

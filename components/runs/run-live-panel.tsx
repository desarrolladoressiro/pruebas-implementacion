'use client';

import { useEffect, useMemo, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { RunStatusPill } from '@/components/runs/run-status-pill';

interface RunLivePanelProps {
  runId: string;
  initialRun: Record<string, any>;
  initialSteps: Array<Record<string, any>>;
  initialEvents: Array<Record<string, any>>;
}

export function RunLivePanel({ runId, initialRun, initialSteps, initialEvents }: RunLivePanelProps) {
  const [run, setRun] = useState(initialRun);
  const [steps, setSteps] = useState(initialSteps);
  const [events, setEvents] = useState(initialEvents);

  const sortedSteps = useMemo(
    () => [...steps].sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0)),
    [steps]
  );

  const sortedEvents = useMemo(
    () => [...events].sort((a, b) => (a.created_at < b.created_at ? -1 : 1)),
    [events]
  );

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();

    const channel = supabase
      .channel(`run-${runId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'runs',
          filter: `id=eq.${runId}`
        },
        (payload) => {
          if (payload.new) {
            setRun(payload.new as Record<string, any>);
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'run_steps',
          filter: `run_id=eq.${runId}`
        },
        (payload) => {
          const newRow = payload.new as Record<string, any>;
          if (!newRow?.id) {
            return;
          }

          setSteps((current) => {
            const index = current.findIndex((item) => item.id === newRow.id);
            if (index === -1) {
              return [...current, newRow];
            }
            const copy = [...current];
            copy[index] = newRow;
            return copy;
          });
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'run_events',
          filter: `run_id=eq.${runId}`
        },
        (payload) => {
          const newRow = payload.new as Record<string, any>;
          if (!newRow?.id) {
            return;
          }

          setEvents((current) => [...current, newRow]);
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [runId]);

  return (
    <div className="grid grid-2">
      <section className="card grid">
        <h2 style={{ margin: 0 }}>Run</h2>
        <div className="row">
          <span className="muted">Estado:</span>
          <RunStatusPill status={String(run.status ?? 'unknown')} />
          <span className="code">{run.id}</span>
        </div>
        <div className="muted">Definicion: {String(run.test_definition_key ?? '-')}</div>
        <div className="muted">Entorno: {String(run.environment ?? '-')}</div>
        <div className="muted">Creada: {String(run.created_at ?? '-')}</div>
      </section>

      <section className="card grid">
        <h2 style={{ margin: 0 }}>Pasos</h2>
        <table className="table">
          <thead>
            <tr>
              <th>#</th>
              <th>Codigo</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            {sortedSteps.map((step) => (
              <tr key={step.id}>
                <td>{step.sequence}</td>
                <td>{step.step_code}</td>
                <td>
                  <RunStatusPill status={String(step.status)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="card" style={{ gridColumn: '1 / -1' }}>
        <h2 style={{ marginTop: 0 }}>Eventos</h2>
        <table className="table">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Nivel</th>
              <th>Mensaje</th>
            </tr>
          </thead>
          <tbody>
            {sortedEvents.map((event) => (
              <tr key={event.id}>
                <td>{String(event.created_at)}</td>
                <td>{String(event.level)}</td>
                <td>{String(event.message)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

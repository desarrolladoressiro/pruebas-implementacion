'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { RunStatusPill } from '@/components/runs/run-status-pill';
import { formatDateTimeAr } from '@/lib/datetime';

interface RunLivePanelProps {
  runId: string;
  initialRun: Record<string, any>;
  initialSteps: Array<Record<string, any>>;
  initialEvents: Array<Record<string, any>>;
  initialArtifacts: Array<Record<string, any>>;
}

function formatJson(value: unknown) {
  if (value === null || value === undefined) {
    return null;
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function RunLivePanel({
  runId,
  initialRun,
  initialSteps,
  initialEvents,
  initialArtifacts
}: RunLivePanelProps) {
  const [run, setRun] = useState(initialRun);
  const [steps, setSteps] = useState(initialSteps);
  const [events, setEvents] = useState(initialEvents);
  const [artifacts, setArtifacts] = useState(initialArtifacts);
  const [qrImages, setQrImages] = useState<Record<string, string>>({});
  const qrImagesRef = useRef<Record<string, string>>(qrImages);

  useEffect(() => {
    qrImagesRef.current = qrImages;
  }, [qrImages]);

  const sortedSteps = useMemo(
    () => [...steps].sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0)),
    [steps]
  );

  const sortedEvents = useMemo(
    () => [...events].sort((a, b) => (a.created_at < b.created_at ? -1 : 1)),
    [events]
  );

  const sortedArtifacts = useMemo(
    () => [...artifacts].sort((a, b) => (a.created_at < b.created_at ? -1 : 1)),
    [artifacts]
  );

  useEffect(() => {
    let mounted = true;

    async function buildQrImages() {
      if (!sortedSteps.length) {
        return;
      }

      try {
        const { toDataURL } = await import('qrcode');
        const updates: Record<string, string> = {};

        for (const step of sortedSteps) {
          const qrText =
            step.response_json?.StringQREstatico ??
            step.response_json?.StringQR ??
            step.response_json?.StringQR;

          if (!qrText || (typeof qrText !== 'string' && typeof qrText !== 'number')) {
            continue;
          }

          if (qrImagesRef.current[step.id]) {
            continue;
          }

          updates[step.id] = await toDataURL(String(qrText), { width: 320 });
        }

        if (mounted && Object.keys(updates).length > 0) {
          setQrImages((current) => ({ ...current, ...updates }));
        }
      } catch {
        // qrcode library missing; user will install later.
      }
    }

    void buildQrImages();

    return () => {
      mounted = false;
    };
  }, [sortedSteps]);

  useEffect(() => {
    let active = true;

    async function poll() {
      try {
        const response = await fetch(`/api/runs/${runId}`, {
          method: 'GET',
          cache: 'no-store'
        });

        if (!response.ok) {
          return;
        }

        const payload = (await response.json()) as {
          run?: Record<string, any>;
          steps?: Array<Record<string, any>>;
          events?: Array<Record<string, any>>;
          artifacts?: Array<Record<string, any>>;
        };

        if (!active) {
          return;
        }

        if (payload.run) setRun(payload.run);
        if (payload.steps) setSteps(payload.steps);
        if (payload.events) setEvents(payload.events);
        if (payload.artifacts) setArtifacts(payload.artifacts);
      } catch {
        // noop: fallback realtime puede seguir actualizando si polling falla temporalmente
      }
    }

    void poll();
    const interval = window.setInterval(() => {
      void poll();
    }, 3000);

    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [runId]);

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
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'run_artifacts',
          filter: `run_id=eq.${runId}`
        },
        (payload) => {
          const newRow = payload.new as Record<string, any>;
          if (!newRow?.id) {
            return;
          }

          setArtifacts((current) => [...current, newRow]);
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
        <div className="muted">Creada: {formatDateTimeAr(run.created_at)}</div>
        {run.input_json ? (
          <details>
            <summary>Input JSON de run</summary>
            <pre className="json-block">{formatJson(run.input_json)}</pre>
          </details>
        ) : null}
        {run.output_json ? (
          <details>
            <summary>Output JSON de run</summary>
            <pre className="json-block">{formatJson(run.output_json)}</pre>
          </details>
        ) : null}
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
        <h2 style={{ marginTop: 0 }}>Request/Response por paso</h2>
        <div className="grid">
          {sortedSteps.map((step) => (
            <details key={`${step.id}-payload`}>
              <summary>
                #{step.sequence} {String(step.step_code)} - {String(step.status)}
              </summary>
              {step.request_json ? (
                <div>
                  <div className="muted">Request</div>
                  <pre className="json-block">{formatJson(step.request_json)}</pre>
                </div>
              ) : null}
              {step.response_json ? (
                <div>
                  <div className="muted">Response</div>
                  <pre className="json-block">{formatJson(step.response_json)}</pre>
                </div>
              ) : null}
              {step.error_message ? (
                <div className="badge badge-err">{String(step.error_message)}</div>
              ) : null}
              {(() => {
                const qrText =
                  step.response_json?.StringQREstatico ??
                  step.response_json?.StringQR ??
                  step.response_json?.StringQR;
                const qrImage = qrImages[step.id];

                if (!qrText && !qrImage) {
                  return null;
                }

                return (
                  <div className="qr-block">
                    <span className="muted">QR</span>
                    {qrImage ? (
                      <img src={qrImage} alt="Código QR generado" />
                    ) : (
                      <div className="muted">Generando QR…</div>
                    )}
                  </div>
                );
              })()}
            </details>
          ))}
        </div>
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
                <td>{formatDateTimeAr(event.created_at)}</td>
                <td>{String(event.level)}</td>
                <td>
                  <div>{String(event.message)}</div>
                  {event.payload_json && Object.keys(event.payload_json).length > 0 ? (
                    <details>
                      <summary>Payload</summary>
                      <pre className="json-block">{formatJson(event.payload_json)}</pre>
                    </details>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="card" style={{ gridColumn: '1 / -1' }}>
        <h2 style={{ marginTop: 0 }}>Artifacts</h2>
        {sortedArtifacts.length === 0 ? (
          <div className="muted">Sin artifacts en esta run.</div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Tipo</th>
                <th>Path</th>
                <th>Preview</th>
              </tr>
            </thead>
            <tbody>
              {sortedArtifacts.map((artifact) => (
                <tr key={artifact.id}>
                  <td>{formatDateTimeAr(artifact.created_at)}</td>
                  <td>{String(artifact.artifact_type)}</td>
                  <td>{String(artifact.storage_path)}</td>
                  <td>
                    {(() => {
                      const dataUrl = String(artifact.metadata_json?.data_url ?? '');
                      if (!dataUrl) {
                        return <span className="muted">-</span>;
                      }

                      const mimeType = String(artifact.metadata_json?.mime_type ?? '');
                      const fileName = String(
                        artifact.metadata_json?.file_name
                        ?? artifact.metadata_json?.name
                        ?? 'artifact'
                      );
                      const isImage = mimeType.startsWith('image/') || dataUrl.startsWith('data:image/');

                      if (isImage) {
                        return (
                          <img
                            src={dataUrl}
                            alt={fileName}
                            style={{
                              width: 220,
                              maxWidth: '100%',
                              border: '1px solid var(--border)',
                              borderRadius: 8
                            }}
                          />
                        );
                      }

                      return (
                        <a href={dataUrl} download={fileName}>
                          Descargar {fileName}
                        </a>
                      );
                    })()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

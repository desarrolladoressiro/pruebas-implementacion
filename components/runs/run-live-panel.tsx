'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { RunStatusPill } from '@/components/runs/run-status-pill';
import { formatDateTimeAr } from '@/lib/datetime';
import {
  getArtifactDisplayName,
  getDefinitionDisplayName,
  getEventDisplayMessage,
  getStepDisplayName
} from '@/lib/runs/display';

interface RunLivePanelProps {
  runId: string;
  initialRun: Record<string, any>;
  initialSteps: Array<Record<string, any>>;
  initialEvents: Array<Record<string, any>>;
  initialArtifacts: Array<Record<string, any>>;
}

function formatJson(value: unknown) {
  if (value === null || value === undefined) return null;
  try { return JSON.stringify(value, null, 2); } catch { return String(value); }
}

function ImageModal({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>×</button>
        <img src={src} alt={alt} className="modal-img" />
      </div>
    </div>
  );
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
  const [selectedImage, setSelectedImage] = useState<{ src: string, alt: string } | null>(null);
  const qrImagesRef = useRef<Record<string, string>>(qrImages);

  useEffect(() => { qrImagesRef.current = qrImages; }, [qrImages]);

  const sortedSteps = useMemo(() => [...steps].sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0)), [steps]);
  const sortedEvents = useMemo(() => [...events].sort((a, b) => (a.created_at < b.created_at ? -1 : 1)), [events]);
  const sortedArtifacts = useMemo(() => [...artifacts].sort((a, b) => (a.created_at < b.created_at ? -1 : 1)), [artifacts]);

  useEffect(() => {
    let mounted = true;
    async function buildQrImages() {
      if (!sortedSteps.length) return;
      try {
        const { toDataURL } = await import('qrcode');
        const updates: Record<string, string> = {};
        for (const step of sortedSteps) {
          const qrText = step.response_json?.StringQREstatico ?? step.response_json?.StringQR ?? step.response_json?.StringQR;
          if (!qrText || (typeof qrText !== 'string' && typeof qrText !== 'number')) continue;
          if (qrImagesRef.current[step.id]) continue;
          updates[step.id] = await toDataURL(String(qrText), { width: 320 });
        }
        if (mounted && Object.keys(updates).length > 0) setQrImages((c) => ({ ...c, ...updates }));
      } catch { }
    }
    void buildQrImages();
    return () => { mounted = false; };
  }, [sortedSteps]);

  useEffect(() => {
    let active = true;
    async function poll() {
      try {
        const response = await fetch(`/api/runs/${runId}`, { method: 'GET', cache: 'no-store' });
        if (!response.ok) return;
        const payload = (await response.json()) as any;
        if (!active) return;
        if (payload.run) setRun(payload.run);
        if (payload.steps) setSteps(payload.steps);
        if (payload.events) setEvents(payload.events);
        if (payload.artifacts) setArtifacts(payload.artifacts);
      } catch { }
    }
    void poll();
    const interval = window.setInterval(poll, 3000);
    return () => { active = false; window.clearInterval(interval); };
  }, [runId]);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    const channel = supabase.channel(`run-${runId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'runs', filter: `id=eq.${runId}` },
        (payload) => { if (payload.new) setRun(payload.new as any); }
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'run_steps', filter: `run_id=eq.${runId}` },
        (payload) => {
          const newRow = payload.new as any;
          if (!newRow?.id) return;
          setSteps((current) => {
            const index = current.findIndex((item) => item.id === newRow.id);
            if (index === -1) return [...current, newRow];
            const copy = [...current]; copy[index] = newRow; return copy;
          });
        }
      )
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'run_events', filter: `run_id=eq.${runId}` },
        (payload) => {
          const newRow = payload.new as any;
          if (!newRow?.id) return;
          setEvents((current) => [...current, newRow]);
        }
      )
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'run_artifacts', filter: `run_id=eq.${runId}` },
        (payload) => {
          const newRow = payload.new as any;
          if (!newRow?.id) return;
          setArtifacts((current) => [...current, newRow]);
        }
      )
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [runId]);

  return (
    <>
      {selectedImage && (
        <ImageModal src={selectedImage.src} alt={selectedImage.alt} onClose={() => setSelectedImage(null)} />
      )}

      <div className="flex justify-between items-center" style={{ marginBottom: 20 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.75rem', color: 'var(--primary)' }}>
            Ejecución: {getDefinitionDisplayName(String(run.test_definition_key ?? ''))}
          </h1>
          <p className="muted" style={{ margin: '4px 0 0 0' }}>{run.id}</p>
        </div>
        <div className="flex gap-3">
          <span className="badge badge-env">
            {String(run.environment || '-')}
          </span>
          <RunStatusPill status={String(run.status ?? 'unknown')} />
        </div>
      </div>

      {/* Main Layout Grid */}
      <div className="grid" style={{ gridTemplateColumns: '1fr 340px', alignItems: 'start', gridAutoFlow: 'row dense' }}>

        {/* Center column: Steps and Artifacts */}
        <div className="flex-col gap-4">

          {/* Artifacts Gallery */}
          {sortedArtifacts.length > 0 && (
            <section className="card">
              <div className="card-header">
                <div>📸 Capturas & Documentos ({sortedArtifacts.length})</div>
              </div>
              <div className="artifacts-grid">
                {sortedArtifacts.map((artifact) => {
                  const dataUrl = String(artifact.metadata_json?.data_url ?? '');
                  if (!dataUrl) return null;
                  const mimeType = String(artifact.metadata_json?.mime_type ?? '');
                  const fileName = String(artifact.metadata_json?.file_name ?? artifact.metadata_json?.name ?? 'artifact');
                  const fileLabel = getArtifactDisplayName(fileName);
                  const isImage = mimeType.startsWith('image/') || dataUrl.startsWith('data:image/');

                  if (isImage) {
                    return (
                      <div key={artifact.id} className="artifact-card animate-enter" onClick={() => setSelectedImage({ src: dataUrl, alt: fileLabel })}>
                        <div className="artifact-img-wrap">
                          <img src={dataUrl} alt={fileLabel} />
                        </div>
                        <div className="artifact-info">
                          <div style={{ fontWeight: 600, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{fileLabel}</div>
                          <div className="muted" style={{ marginTop: 2 }}>{formatDateTimeAr(artifact.created_at).split(',')[1]}</div>
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div key={artifact.id} className="artifact-card animate-enter" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 100 }}>
                      <a href={dataUrl} download={fileName} className="btn btn-secondary">
                        Descargar {fileLabel}
                      </a>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Steps Detail Cards */}
          <section className="card">
            <div className="card-header">
              <div>Proceso y pasos ejecutados</div>
            </div>
            <div className="flex-col gap-3">
              {sortedSteps.map((step) => (
                <details key={step.id} className="animate-enter" style={{ marginBottom: 0 }}>
                  <summary>
                    <div className="flex justify-between items-center w-full" style={{ flex: 1, marginRight: 8 }}>
                      <div>
                        <span className="muted" style={{ marginRight: 8 }}>#{step.sequence}</span>
                        <span style={{ fontWeight: 600 }}>{getStepDisplayName(step.step_name, step.step_code)}</span>
                      </div>
                      <RunStatusPill status={String(step.status)} />
                    </div>
                  </summary>

                  {step.error_message && (
                    <div style={{ margin: '12px 0' }}>
                      <div className="badge badge-err" style={{ minWidth: 'auto', padding: '6px 16px', height: 'auto', whiteSpace: 'normal', lineHeight: '1.4', textAlign: 'left', width: '100%', justifyContent: 'flex-start' }}>
                        {String(step.error_message)}
                      </div>
                    </div>
                  )}

                  <div className="grid grid-2" style={{ gap: 12, marginTop: 12 }}>
                    {step.request_json && (
                      <div className="flex-col">
                        <span className="muted" style={{ fontSize: 13, marginBottom: 4 }}>Payload Enviado (Request)</span>
                        <pre className="json-block" style={{ margin: 0 }}>{formatJson(step.request_json)}</pre>
                      </div>
                    )}

                    {step.response_json && (
                      <div className="flex-col">
                        <span className="muted" style={{ fontSize: 13, marginBottom: 4 }}>Respuesta (Response)</span>
                        <pre className="json-block" style={{ margin: 0 }}>{formatJson(step.response_json)}</pre>
                      </div>
                    )}
                  </div>

                  {(() => {
                    const qrText = step.response_json?.StringQREstatico ?? step.response_json?.StringQR ?? step.response_json?.StringQR;
                    const qrImage = qrImages[step.id];
                    if (!qrText && !qrImage) return null;
                    return (
                      <div style={{ marginTop: 16 }}>
                        <span className="muted" style={{ fontSize: 13, marginBottom: 8, display: 'block' }}>Código QR</span>
                        {qrImage ? (
                          <div className="artifact-card" style={{ display: 'inline-block' }} onClick={() => setSelectedImage({ src: qrImage, alt: "Código QR" })}>
                            <img src={qrImage} alt="QR" style={{ width: 180, height: 180, objectFit: 'contain', padding: 12 }} />
                          </div>
                        ) : (
                          <div className="muted">Generando QR...</div>
                        )}
                      </div>
                    );
                  })()}
                </details>
              ))}
              {sortedSteps.length === 0 && <div className="muted">Todavía no hay pasos ejecutados en este run.</div>}
            </div>
          </section>

          {/* System Info Collapsible */}
          <details style={{ background: 'transparent', border: 'none', padding: 0, boxShadow: 'none' }}>
            <summary style={{ padding: '12px 16px', background: 'var(--bg-soft)', border: '1px solid var(--border)', borderRadius: 12 }}>
              <span style={{ fontSize: '14px', color: 'var(--muted)' }}>Mostrar información bruta y JSON general (Debug)</span>
            </summary>
            <div className="card mt-4" style={{ marginTop: 16 }}>
              {run.input_json && (
                <div style={{ marginBottom: 16 }}>
                  <div className="muted" style={{ fontWeight: 600 }}>Input JSON</div>
                  <pre className="json-block">{formatJson(run.input_json)}</pre>
                </div>
              )}
              {run.output_json && (
                <div>
                  <div className="muted" style={{ fontWeight: 600 }}>Output JSON</div>
                  <pre className="json-block">{formatJson(run.output_json)}</pre>
                </div>
              )}
            </div>
          </details>
        </div>

        {/* Right column: Event Logs Sidebar */}
        <section className="card" style={{ position: 'sticky', top: 0, maxHeight: 'calc(100vh - 48px)', display: 'flex', flexDirection: 'column', padding: 0 }}>
          <div className="card-header" style={{ padding: '20px', margin: 0, background: 'var(--bg-soft)', borderTopLeftRadius: 16, borderTopRightRadius: 16 }}>
            <div>📋 Historial de Eventos</div>
          </div>
          <div style={{ overflowY: 'auto', padding: 20 }}>
            <div className="flex-col gap-3">
              {sortedEvents.length === 0 ? (
                <div className="muted text-center" style={{ textAlign: 'center' }}>No hay eventos guardados.</div>
              ) : (
                sortedEvents.map((evt) => (
                  <div key={evt.id} className="animate-enter" style={{ borderLeft: `2px solid ${evt.level === 'error' ? 'var(--err)' : evt.level === 'warn' ? 'var(--warn)' : 'var(--primary)'}`, paddingLeft: 12, marginLeft: 2 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
                      {getEventDisplayMessage(String(evt.message))}
                    </div>
                    <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>{formatDateTimeAr(evt.created_at)}</div>
                    {evt.payload_json && Object.keys(evt.payload_json).length > 0 && (
                      <details style={{ margin: '8px 0 0 0', padding: '6px 10px', fontSize: 12, borderRadius: 6 }}>
                        <summary style={{ fontSize: 12 }}>Ver datos</summary>
                        <pre className="json-block" style={{ padding: 8, fontSize: 11, margin: '8px 0 0 0' }}>{formatJson(evt.payload_json)}</pre>
                      </details>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </section>

      </div>
    </>
  );
}

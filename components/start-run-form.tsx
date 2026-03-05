'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getDefinitionDisplayName } from '@/lib/runs/display';

interface StartRunFormProps {
  definitions: Array<{
    key: string;
    name: string;
    domain: string;
    description: string;
    default_input: Record<string, any> | null;
  }>;
}

export function StartRunForm({ definitions }: StartRunFormProps) {
  const router = useRouter();
  const initialDefinition = definitions[0];
  const [definitionKey, setDefinitionKey] = useState(initialDefinition?.key ?? '');
  const [environment, setEnvironment] = useState<'homologacion' | 'produccion'>('produccion');
  const [jsonInput, setJsonInput] = useState(
    JSON.stringify(initialDefinition?.default_input ?? {}, null, 2)
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedDefinition = useMemo(
    () => definitions.find((item) => item.key === definitionKey),
    [definitionKey, definitions]
  );

  useEffect(() => {
    const defaults = selectedDefinition?.default_input ?? {};
    setJsonInput(JSON.stringify(defaults, null, 2));
  }, [selectedDefinition?.key]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const parsedInput = jsonInput.trim() ? JSON.parse(jsonInput) : {};
      const response = await fetch('/api/runs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          testDefinitionKey: definitionKey,
          environment,
          inputJson: parsedInput
        })
      });

      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error ?? 'No se pudo iniciar run.');
      }

      router.push(`/runs/${payload.run.id}`);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Error desconocido.');
      setSubmitting(false); // only stop if error, otherwise it stays disabled until page unloads
    }
  }

  return (
    <form className="flex-col gap-4" onSubmit={handleSubmit}>
      <label className="flex-col gap-2">
        <span style={{ fontWeight: 500, fontSize: 14 }}>Definición de prueba</span>
        <select
          className="select"
          value={definitionKey}
          onChange={(event) => setDefinitionKey(event.target.value)}
        >
          {definitions.map((definition) => (
            <option key={definition.key} value={definition.key}>
              {getDefinitionDisplayName(definition.key)}
            </option>
          ))}
        </select>
      </label>

      {selectedDefinition?.description && (
        <div className="muted" style={{ fontSize: 13, background: 'var(--bg-soft)', padding: 12, borderRadius: 8, border: '1px solid var(--border)' }}>
          💡 {selectedDefinition.description}
        </div>
      )}

      <label className="flex-col gap-2">
        <span style={{ fontWeight: 500, fontSize: 14 }}>Entorno</span>
        <select
          className="select"
          value={environment}
          onChange={(event) => setEnvironment(event.target.value as 'homologacion' | 'produccion')}
        >
          <option value="homologacion">homologacion</option>
          <option value="produccion">produccion</option>
        </select>
      </label>

      <label className="flex-col gap-2">
        <div className="flex justify-between items-center">
          <span style={{ fontWeight: 500, fontSize: 14 }}>Input JSON</span>
          <span className="muted" style={{ fontSize: 12 }}>(Precargado con defaults)</span>
        </div>
        <textarea
          className="textarea"
          rows={12}
          value={jsonInput}
          onChange={(event) => setJsonInput(event.target.value)}
          style={{ fontFamily: 'ui-monospace, monospace', fontSize: 13, resize: 'vertical' }}
        />
      </label>

      {error ? <div className="badge badge-err" style={{ display: 'block' }}>{error}</div> : null}

      <div className="row" style={{ marginTop: 8 }}>
        <button className="btn w-full" type="submit" disabled={submitting || !definitionKey} style={{ padding: '14px 18px', fontSize: 16 }}>
          {submitting ? 'Iniciando ejecución...' : '▶ Iniciar Ejecución'}
        </button>
      </div>
    </form>
  );
}

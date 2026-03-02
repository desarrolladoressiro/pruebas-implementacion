'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

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
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="card grid" onSubmit={handleSubmit}>
      <h2 style={{ margin: 0 }}>Nueva Ejecucion API</h2>

      <label>
        Definicion de prueba
        <select
          className="select"
          value={definitionKey}
          onChange={(event) => setDefinitionKey(event.target.value)}
        >
          {definitions.map((definition) => (
            <option key={definition.key} value={definition.key}>
              [{definition.domain}] {definition.name}
            </option>
          ))}
        </select>
      </label>

      <label>
        Entorno
        <select
          className="select"
          value={environment}
          onChange={(event) => setEnvironment(event.target.value as 'homologacion' | 'produccion')}
        >
          <option value="homologacion">homologacion</option>
          <option value="produccion">produccion</option>
        </select>
      </label>

      <div className="muted" style={{ fontSize: 13 }}>
        {selectedDefinition?.description}
      </div>

      <label>
        Input JSON (se precarga con defaults)
        <textarea
          className="textarea"
          rows={10}
          value={jsonInput}
          onChange={(event) => setJsonInput(event.target.value)}
        />
      </label>

      {error ? <div className="badge badge-err">{error}</div> : null}

      <div className="row">
        <button className="btn" type="submit" disabled={submitting || !definitionKey}>
          {submitting ? 'Iniciando...' : 'Iniciar run'}
        </button>
      </div>
    </form>
  );
}

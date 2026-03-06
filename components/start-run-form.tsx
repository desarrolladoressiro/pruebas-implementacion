'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { getDefinitionDisplayName } from '@/lib/runs/display';
import { JsonObject, JsonValue } from '@/lib/types';

interface StartRunFormProps {
  definitions: Array<{
    key: string;
    name: string;
    domain: string;
    description: string;
    default_input: JsonObject | null;
  }>;
}

type JsonPath = Array<string | number>;

const SELECT_OPTIONS_BY_KEY: Record<string, string[]> = {
  canal: ['td', 'tc', 'qr', 'debin', 'link', 'pmc'],
  formato: ['basico', 'full'],
  tipoadhesion: ['DD', 'VS'],
  tipoadhesionnueva: ['DD', 'VS']
};

function cloneJson<T extends JsonValue>(value: T): T {
  if (value === undefined) {
    return value;
  }

  return JSON.parse(JSON.stringify(value)) as T;
}

function formatFieldLabel(key: string) {
  const normalized = key
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .trim();

  if (!normalized) {
    return key;
  }

  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function resolveSelectOptions(fieldKey: string, currentValue: string) {
  const options = SELECT_OPTIONS_BY_KEY[fieldKey.toLowerCase()];
  if (!options) {
    return null;
  }

  if (currentValue && !options.includes(currentValue)) {
    return [currentValue, ...options];
  }

  return options;
}

export function StartRunForm({ definitions }: StartRunFormProps) {
  const router = useRouter();
  const initialDefinition = definitions[0];
  const [definitionKey, setDefinitionKey] = useState(initialDefinition?.key ?? '');
  const [environment, setEnvironment] = useState<'homologacion' | 'produccion'>('produccion');
  const [inputValues, setInputValues] = useState<JsonObject>(
    cloneJson(initialDefinition?.default_input ?? {}) as JsonObject
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedDefinition = useMemo(
    () => definitions.find((item) => item.key === definitionKey),
    [definitionKey, definitions]
  );

  useEffect(() => {
    const defaults = selectedDefinition?.default_input ?? {};
    setInputValues(cloneJson(defaults) as JsonObject);
  }, [selectedDefinition?.key]);

  function updateInputByPath(path: JsonPath, value: JsonValue) {
    setInputValues((previous) => {
      const next = cloneJson(previous) as JsonObject;
      if (path.length === 0) {
        return (typeof value === 'object' && value !== null && !Array.isArray(value)
          ? value
          : {}) as JsonObject;
      }

      let cursor: any = next;
      for (let index = 0; index < path.length - 1; index += 1) {
        const currentSegment = path[index];
        const nextSegment = path[index + 1];

        if (
          cursor[currentSegment] === undefined ||
          cursor[currentSegment] === null ||
          typeof cursor[currentSegment] !== 'object'
        ) {
          cursor[currentSegment] = typeof nextSegment === 'number' ? [] : {};
        }

        cursor = cursor[currentSegment];
      }

      cursor[path[path.length - 1]] = value;
      return next;
    });
  }

  function addArrayItem(path: JsonPath, arrayValue: JsonValue[]) {
    const template = arrayValue.length > 0 ? cloneJson(arrayValue[0]) : '';
    updateInputByPath(path, [...arrayValue, template]);
  }

  function removeArrayItem(path: JsonPath, arrayValue: JsonValue[], indexToRemove: number) {
    updateInputByPath(
      path,
      arrayValue.filter((_, index) => index !== indexToRemove)
    );
  }

  function renderJsonValue(path: JsonPath, fieldKey: string, value: JsonValue): ReactNode {
    if (Array.isArray(value)) {
      return (
        <div className="flex-col gap-2">
          {value.map((item, index) => (
            <div
              key={`${path.join('.')}-${index}`}
              style={{
                border: '1px solid var(--border)',
                borderRadius: 8,
                padding: 10,
                background: 'var(--bg-soft)'
              }}
            >
              <div className="flex justify-between items-center" style={{ marginBottom: 8 }}>
                <span className="muted" style={{ fontSize: 12 }}>
                  Item {index + 1}
                </span>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ padding: '4px 8px', fontSize: 12 }}
                  onClick={() => removeArrayItem(path, value, index)}
                >
                  Quitar
                </button>
              </div>
              {renderJsonValue([...path, index], `${fieldKey}_${index}`, item)}
            </div>
          ))}
          <button
            type="button"
            className="btn btn-secondary"
            style={{ fontSize: 12, padding: '6px 10px', alignSelf: 'flex-start' }}
            onClick={() => addArrayItem(path, value)}
          >
            + Agregar item
          </button>
        </div>
      );
    }

    if (value !== null && typeof value === 'object') {
      const entries = Object.entries(value);
      return (
        <div className="flex-col gap-3">
          {entries.length === 0 && (
            <span className="muted" style={{ fontSize: 12 }}>
              Sin campos configurables.
            </span>
          )}
          {entries.map(([childKey, childValue]) => (
            <label key={`${path.join('.')}.${childKey}`} className="flex-col gap-2">
              <span style={{ fontWeight: 500, fontSize: 13 }}>{formatFieldLabel(childKey)}</span>
              {renderJsonValue([...path, childKey], childKey, childValue)}
            </label>
          ))}
        </div>
      );
    }

    if (typeof value === 'boolean') {
      return (
        <label className="row" style={{ gap: 8, justifyContent: 'flex-start' }}>
          <input
            type="checkbox"
            checked={value}
            onChange={(event) => updateInputByPath(path, event.target.checked)}
          />
          <span className="muted" style={{ fontSize: 13 }}>
            Habilitado
          </span>
        </label>
      );
    }

    if (typeof value === 'number') {
      return (
        <input
          className="input"
          type="number"
          value={Number.isFinite(value) ? String(value) : '0'}
          onChange={(event) => {
            const raw = event.target.value.trim();
            const parsed = raw === '' ? 0 : Number(raw);
            updateInputByPath(path, Number.isFinite(parsed) ? parsed : 0);
          }}
        />
      );
    }

    const safeValue = value === null || value === undefined ? '' : String(value);
    const options = resolveSelectOptions(fieldKey, safeValue);

    if (options) {
      return (
        <select
          className="select"
          value={safeValue}
          onChange={(event) => updateInputByPath(path, event.target.value)}
        >
          {options.map((option) => (
            <option key={`${fieldKey}-${option}`} value={option}>
              {option}
            </option>
          ))}
        </select>
      );
    }

    return (
      <input
        className="input"
        type="text"
        value={safeValue}
        onChange={(event) => updateInputByPath(path, event.target.value)}
      />
    );
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch('/api/runs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          testDefinitionKey: definitionKey,
          environment,
          inputJson: inputValues
        })
      });

      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error ?? 'No se pudo iniciar run.');
      }

      router.push(`/runs/${payload.run.id}`);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Error desconocido.');
      setSubmitting(false);
    }
  }

  return (
    <form className="flex-col gap-4" onSubmit={handleSubmit}>
      <label className="flex-col gap-2">
        <span style={{ fontWeight: 500, fontSize: 14 }}>Definicion de prueba</span>
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
        <div
          className="muted"
          style={{
            fontSize: 13,
            background: 'var(--bg-soft)',
            padding: 12,
            borderRadius: 8,
            border: '1px solid var(--border)'
          }}
        >
          {selectedDefinition.description}
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

      <div className="flex-col gap-2">
        <div className="flex justify-between items-center">
          <span style={{ fontWeight: 500, fontSize: 14 }}>Parametros</span>
          <span className="muted" style={{ fontSize: 12 }}>
            Formulario generado desde defaults
          </span>
        </div>
        <div
          className="flex-col gap-3"
          style={{
            border: '1px solid var(--border)',
            borderRadius: 10,
            padding: 12,
            background: 'var(--bg-soft)'
          }}
        >
          {Object.keys(inputValues).length === 0 ? (
            <span className="muted" style={{ fontSize: 13 }}>
              Esta definicion no requiere parametros manuales.
            </span>
          ) : (
            Object.entries(inputValues).map(([key, value]) => (
              <label key={key} className="flex-col gap-2">
                <span style={{ fontWeight: 500, fontSize: 13 }}>{formatFieldLabel(key)}</span>
                {renderJsonValue([key], key, value)}
              </label>
            ))
          )}
        </div>

        <details>
          <summary>
            JSON de vista previa
            <span className="muted" style={{ fontWeight: 400, fontSize: 12 }}>
              (solo lectura)
            </span>
          </summary>
          <pre className="json-block">{JSON.stringify(inputValues, null, 2)}</pre>
        </details>
      </div>

      {error ? (
        <div className="badge badge-err" style={{ display: 'block' }}>
          {error}
        </div>
      ) : null}

      <div className="row" style={{ marginTop: 8 }}>
        <button
          className="btn w-full"
          type="submit"
          disabled={submitting || !definitionKey}
          style={{ padding: '14px 18px', fontSize: 16 }}
        >
          {submitting ? 'Iniciando ejecucion...' : 'Iniciar Ejecucion'}
        </button>
      </div>
    </form>
  );
}

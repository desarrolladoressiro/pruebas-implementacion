'use client';

import { useState } from 'react';
import { BANK_OPTIONS } from '@/lib/banks';

interface ProfileData {
  email: string | null;
  dni: string | null;
  cbu: string | null;
  alias: string | null;
  preferred_bank: string | null;
  base_cliente: string | null;
  notes: string | null;
}

export function ProfileForm({ profile }: { profile: ProfileData }) {
  const [form, setForm] = useState<ProfileData>(profile);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function patchField<K extends keyof ProfileData>(key: K, value: ProfileData[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    setError(null);

    try {
      const response = await fetch('/api/profile', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(form)
      });

      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error ?? 'No se pudo actualizar perfil.');
      }

      setForm(payload.profile);
      setMessage('Perfil actualizado.');
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Error desconocido.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="flex-col gap-4 animate-enter" onSubmit={handleSubmit}>
      <label className="flex-col gap-2">
        <span style={{ fontWeight: 500, fontSize: 14 }}>Email</span>
        <input className="input" value={form.email ?? ''} disabled />
      </label>

      <div className="grid grid-2">
        <label className="flex-col gap-2">
          <span style={{ fontWeight: 500, fontSize: 14 }}>Base cliente (8 o 9 digitos)</span>
          <input
            className="input"
            value={form.base_cliente ?? ''}
            onChange={(event) => patchField('base_cliente', event.target.value)}
          />
        </label>

        <label className="flex-col gap-2">
          <span style={{ fontWeight: 500, fontSize: 14 }}>Banco preferido</span>
          <select
            className="select"
            value={form.preferred_bank ?? ''}
            onChange={(event) => patchField('preferred_bank', event.target.value || null)}
          >
            <option value="">Seleccionar banco</option>
            {BANK_OPTIONS.map((bank) => (
              <option key={`${bank.value}-${bank.label}`} value={bank.value}>
                {bank.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid grid-2">
        <label className="flex-col gap-2">
          <span style={{ fontWeight: 500, fontSize: 14 }}>DNI</span>
          <input className="input" value={form.dni ?? ''} onChange={(event) => patchField('dni', event.target.value)} />
        </label>

        <label className="flex-col gap-2">
          <span style={{ fontWeight: 500, fontSize: 14 }}>CBU</span>
          <input className="input" value={form.cbu ?? ''} onChange={(event) => patchField('cbu', event.target.value)} />
        </label>
      </div>

      <label className="flex-col gap-2">
        <span style={{ fontWeight: 500, fontSize: 14 }}>Alias</span>
        <input className="input" value={form.alias ?? ''} onChange={(event) => patchField('alias', event.target.value)} />
      </label>

      {/* <label className="flex-col gap-2">
        <span style={{ fontWeight: 500, fontSize: 14 }}>Notas operativas</span>
        <textarea
          className="textarea"
          rows={4}
          value={form.notes ?? ''}
          onChange={(event) => patchField('notes', event.target.value)}
        />
      </label> */}

      {message && <div style={{ marginTop: 8 }}><div className="badge badge-ok" style={{ width: '100%', height: 'auto', padding: '10px' }}>{message}</div></div>}
      {error && <div style={{ marginTop: 8 }}><div className="badge badge-err" style={{ width: '100%', height: 'auto', padding: '10px' }}>{error}</div></div>}

      <div style={{ marginTop: 8 }}>
        <button className="btn" type="submit" disabled={saving}>
          {saving ? 'Guardando...' : 'Guardar perfil'}
        </button>
      </div>
    </form>
  );
}

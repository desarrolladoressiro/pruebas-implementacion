import { JsonObject } from '@/lib/types';

export function parseInputJson(raw: string): JsonObject {
  if (!raw.trim()) {
    return {};
  }

  const parsed = JSON.parse(raw) as JsonObject;

  if (parsed === null || Array.isArray(parsed)) {
    throw new Error('El input JSON debe ser un objeto.');
  }

  return parsed;
}

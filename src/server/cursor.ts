import { HttpError } from './http';

const CURSOR_PATTERN = /^v1\.([0-9a-z]+)$/;

export function encodeCursor(sequence: number): string {
  return `v1.${sequence.toString(36)}`;
}

export function decodeCursor(cursor: string | null): number {
  if (cursor === null) return 0;
  const match = CURSOR_PATTERN.exec(cursor);
  const encoded = match?.[1];
  if (!encoded) throw new HttpError(400, 'Cursor inválido.', 'invalid_cursor');
  const sequence = Number.parseInt(encoded, 36);
  if (!Number.isSafeInteger(sequence) || sequence < 0) {
    throw new HttpError(400, 'Cursor inválido.', 'invalid_cursor');
  }
  return sequence;
}

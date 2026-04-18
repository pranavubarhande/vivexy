/**
 * Deep case conversion utilities for snake_case ↔ camelCase transformation.
 * Used by axios interceptors to normalise data between the Flask backend
 * (snake_case) and the Next.js frontend (camelCase).
 */

/** Convert a single snake_case key to camelCase. */
const snakeToCamelKey = (key: string): string =>
  key.replace(/_([a-z])/g, (_, char) => char.toUpperCase());

/** Convert a single camelCase key to snake_case. */
const camelToSnakeKey = (key: string): string =>
  key.replace(/([A-Z])/g, (char) => `_${char.toLowerCase()}`);

type AnyValue = Record<string, unknown> | unknown[] | unknown;

/**
 * Recursively deep-convert all object keys from snake_case → camelCase.
 * - Arrays: each element is recursively converted.
 * - Primitives / null: returned as-is.
 * - Keys beginning with `_` (e.g. `_count`) are left unchanged.
 */
export const snakeToCamel = (value: AnyValue): AnyValue => {
  if (Array.isArray(value)) {
    return value.map(snakeToCamel);
  }

  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [
        k.startsWith('_') ? k : snakeToCamelKey(k),
        snakeToCamel(v),
      ])
    );
  }

  return value;
};

/**
 * Recursively deep-convert all object keys from camelCase → snake_case.
 * - Arrays: each element is recursively converted.
 * - Primitives / null: returned as-is.
 * - Keys beginning with `_` are left unchanged.
 */
export const camelToSnake = (value: AnyValue): AnyValue => {
  if (Array.isArray(value)) {
    return value.map(camelToSnake);
  }

  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [
        k.startsWith('_') ? k : camelToSnakeKey(k),
        camelToSnake(v),
      ])
    );
  }

  return value;
};

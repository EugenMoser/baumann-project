// Same shape as lib/result.ts. Duplicated because the import scripts run on
// plain Node, which warns when loading the typeless `.ts` modules in lib/.
export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

export const ok = <T,>(value: T): Result<T, never> => ({ ok: true, value });
export const err = <E,>(error: E): Result<never, E> => ({ ok: false, error });

export type NamedRef = { id: number; name: string; sortName?: string } & Record<string, unknown>;

export function patchNamedRefs<T extends NamedRef>(
  refs: readonly T[] | undefined,
  id: number,
  patch: Partial<T>,
): { refs: T[] | undefined; changed: boolean } {
  if (!refs) return { refs, changed: false };

  let changed = false;
  const next = refs.map((ref) => {
    if (ref.id !== id) return ref;
    const merged = { ...ref, ...patch };
    const refAny = ref as Record<string, unknown>;
    const mergedAny = merged as Record<string, unknown>;

    if (
      Object.keys(mergedAny).length !== Object.keys(refAny).length
      || Object.keys(mergedAny).some((key) => refAny[key] !== mergedAny[key])
    ) {
      changed = true;
      return merged;
    }
    return ref;
  });

  return { refs: changed ? next : (refs as T[]), changed };
}

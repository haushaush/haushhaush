import { useState, useEffect, useCallback, useRef } from 'react';

interface UseFormDraftOptions<T> {
  key: string;
  initialValue: T;
  debounceMs?: number;
  expireAfterDays?: number;
  warnOnUnload?: boolean;
}

export function useFormDraft<T extends Record<string, any>>({
  key,
  initialValue,
  debounceMs = 400,
  expireAfterDays = 7,
  warnOnUnload = true,
}: UseFormDraftOptions<T>) {
  const storageKey = `draft:${key}`;
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>();
  const isDirtyRef = useRef(false);

  const [state, setState] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return initialValue;
      const parsed = JSON.parse(raw);
      if (parsed._savedAt) {
        const ageDays = (Date.now() - parsed._savedAt) / (1000 * 60 * 60 * 24);
        if (ageDays > expireAfterDays) {
          localStorage.removeItem(storageKey);
          return initialValue;
        }
      }
      return { ...initialValue, ...parsed.data };
    } catch {
      return initialValue;
    }
  });

  useEffect(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      try {
        const hasContent = Object.values(state).some(
          (v) =>
            v !== null &&
            v !== undefined &&
            v !== '' &&
            (!Array.isArray(v) || v.length > 0)
        );
        if (hasContent) {
          localStorage.setItem(
            storageKey,
            JSON.stringify({ data: state, _savedAt: Date.now() })
          );
          isDirtyRef.current = true;
        }
      } catch (e) {
        console.warn('Draft save failed', e);
      }
    }, debounceMs);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [state, storageKey, debounceMs]);

  useEffect(() => {
    if (!warnOnUnload) return;
    const handler = (e: BeforeUnloadEvent) => {
      if (isDirtyRef.current) {
        e.preventDefault();
        e.returnValue = '';
        return '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [warnOnUnload]);

  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key === storageKey && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue);
          setState((prev) => ({ ...prev, ...parsed.data }));
        } catch {}
      }
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, [storageKey]);

  const clearDraft = useCallback(() => {
    localStorage.removeItem(storageKey);
    setState(initialValue);
    isDirtyRef.current = false;
  }, [storageKey, initialValue]);

  const markSaved = useCallback(() => {
    localStorage.removeItem(storageKey);
    isDirtyRef.current = false;
  }, [storageKey]);

  return {
    state,
    setState,
    clearDraft,
    markSaved,
    hasDraft: isDirtyRef.current,
  };
}

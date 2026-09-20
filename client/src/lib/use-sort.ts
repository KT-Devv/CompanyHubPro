import { useMemo, useState } from 'react';

export type SortDirection = 'asc' | 'desc';
export type SortValue = string | number | null | undefined;

export interface SortState {
  key: string;
  direction: SortDirection;
}

// Client-side sorting for tables. `accessors` maps a column key to the value
// to compare; strings compare case-insensitively (and numbers numerically),
// empty values always sort last.
export function useSort<T>(
  items: T[],
  accessors: Record<string, (item: T) => SortValue>,
  initial?: SortState,
) {
  const [sort, setSort] = useState<SortState | undefined>(initial);

  const sorted = useMemo(() => {
    if (!sort) return items;
    const get = accessors[sort.key];
    if (!get) return items;
    const dir = sort.direction === 'asc' ? 1 : -1;
    return [...items].sort((a, b) => {
      const av = get(a);
      const bv = get(b);
      const aEmpty = av == null || av === '';
      const bEmpty = bv == null || bv === '';
      if (aEmpty || bEmpty) return aEmpty === bEmpty ? 0 : aEmpty ? 1 : -1;
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
      return String(av).localeCompare(String(bv), undefined, { sensitivity: 'base', numeric: true }) * dir;
    });
    // accessors are recreated each render by callers; the sort key/direction and items are what matter
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, sort]);

  function toggle(key: string) {
    setSort((current) =>
      current?.key === key
        ? { key, direction: current.direction === 'asc' ? 'desc' : 'asc' }
        : { key, direction: 'asc' },
    );
  }

  return { sorted, sort, toggle };
}

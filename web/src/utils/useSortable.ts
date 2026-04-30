import { useMemo, useState } from 'react';

export type SortDir = 'asc' | 'desc';

export interface SortableState<K extends string> {
  sortKey: K | null;
  sortDir: SortDir;
  toggle: (key: K) => void;
  indicator: (key: K) => string;
}

/**
 * 通用排序 hook。
 * - getValue: 字段访问器，按 key 返回可比较值（number / string）。
 * - 默认升序点击切换为降序，再次点击重置为无序。
 */
export function useSortable<T, K extends string>(
  list: T[],
  getValue: (item: T, key: K) => number | string | null | undefined,
  defaultKey: K | null = null,
  defaultDir: SortDir = 'desc',
): { sorted: T[]; state: SortableState<K> } {
  const [sortKey, setSortKey] = useState<K | null>(defaultKey);
  const [sortDir, setSortDir] = useState<SortDir>(defaultDir);

  const toggle = (key: K) => {
    if (sortKey !== key) {
      setSortKey(key);
      setSortDir('desc');
    } else if (sortDir === 'desc') {
      setSortDir('asc');
    } else {
      setSortKey(null);
    }
  };

  const indicator = (key: K) => {
    if (sortKey !== key) return ' ⇅';
    return sortDir === 'desc' ? ' ↓' : ' ↑';
  };

  const sorted = useMemo(() => {
    if (!sortKey) return list;
    const arr = [...list];
    arr.sort((a, b) => {
      const va = getValue(a, sortKey);
      const vb = getValue(b, sortKey);
      const na = typeof va === 'number' ? va : Number(va);
      const nb = typeof vb === 'number' ? vb : Number(vb);
      const aIsNum = !isNaN(na) && va !== null && va !== undefined && va !== '';
      const bIsNum = !isNaN(nb) && vb !== null && vb !== undefined && vb !== '';
      let cmp: number;
      if (aIsNum && bIsNum) {
        cmp = na - nb;
      } else {
        cmp = String(va ?? '').localeCompare(String(vb ?? ''));
      }
      return sortDir === 'desc' ? -cmp : cmp;
    });
    return arr;
  }, [list, sortKey, sortDir, getValue]);

  return { sorted, state: { sortKey, sortDir, toggle, indicator } };
}

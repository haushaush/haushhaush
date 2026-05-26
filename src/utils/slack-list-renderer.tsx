import { ReactNode } from 'react';

export interface SlackChoice {
  id: string;
  label?: string;
  name?: string;
  value?: string;
  color?: string;
}

export interface SlackColumn {
  id: string;
  name: string;
  type?: string;
  options?: { choices?: SlackChoice[] } | SlackChoice[] | any;
}

function getChoices(col?: SlackColumn): SlackChoice[] {
  if (!col?.options) return [];
  const o: any = col.options;
  if (Array.isArray(o)) return o;
  if (Array.isArray(o.choices)) return o.choices;
  if (Array.isArray(o.values)) return o.values;
  return [];
}

function resolveOption(optId: string, choices: SlackChoice[]): SlackChoice | undefined {
  if (!optId) return undefined;
  return choices.find((c) => c.id === optId || c.value === optId);
}

function extractOptionIds(cell: any): string[] {
  if (cell == null) return [];
  // Cell can be object with .select, .value (string or array), or primitive string
  if (typeof cell === 'string') {
    return /^Opt[A-Z0-9]+$/.test(cell) ? [cell] : [];
  }
  if (Array.isArray(cell)) {
    return cell.filter((v) => typeof v === 'string' && /^Opt[A-Z0-9]+$/.test(v));
  }
  if (typeof cell === 'object') {
    if (Array.isArray(cell.select)) {
      return cell.select.filter((v: unknown) => typeof v === 'string');
    }
    if (Array.isArray(cell.value)) {
      return cell.value.filter((v: unknown) => typeof v === 'string');
    }
    if (typeof cell.value === 'string' && /^Opt[A-Z0-9]+$/.test(cell.value)) {
      return [cell.value];
    }
  }
  return [];
}


/**
 * Parse a Slack rich_text block tree into plain text.
 */
function richTextToPlain(rich: any): string {
  if (!rich) return '';
  let parsed = rich;
  if (typeof rich === 'string') {
    const s = rich.trim();
    if (s.startsWith('[') || s.startsWith('{')) {
      try { parsed = JSON.parse(s); } catch { return rich; }
    } else {
      return rich;
    }
  }
  if (!Array.isArray(parsed)) parsed = [parsed];
  const walk = (node: any): string => {
    if (node == null) return '';
    if (typeof node === 'string') return node;
    if (typeof node.text === 'string') return node.text;
    if (Array.isArray(node.elements)) return node.elements.map(walk).join('');
    if (Array.isArray(node)) return node.map(walk).join('');
    return '';
  };
  return parsed.map(walk).join('\n').trim();
}

/**
 * Cell input can be:
 *  - primitive (string / number / boolean / null)
 *  - object: { value, text, rich_text }
 *  - rich_text JSON string (legacy stored format)
 *  - array of selected option objects
 */
export function renderCellPlain(cell: any, col?: SlackColumn): string {
  // SELECT / MULTI_SELECT — resolve option_id to label via column.options.choices
  if (col && (col.type === 'select' || col.type === 'multi_select')) {
    const ids = extractOptionIds(cell);
    if (ids.length > 0) {
      const choices = getChoices(col);
      return ids
        .map((id) => {
          const ch = resolveOption(id, choices);
          return ch?.label || ch?.name || id;
        })
        .join(', ');
    }
    return '';
  }

  if (cell == null) return '';
  if (typeof cell === 'boolean') return cell ? '✓' : '';
  if (typeof cell === 'number') return String(cell);

  if (typeof cell === 'string') {
    const s = cell.trim();
    if (s.startsWith('[{') || s.startsWith('{"type"')) {
      const plain = richTextToPlain(s);
      if (plain) return plain;
    }
    return cell;
  }

  if (Array.isArray(cell)) {
    return cell
      .map((v) => (typeof v === 'string' || typeof v === 'number'
        ? String(v)
        : v?.text ?? v?.value ?? v?.label ?? ''))
      .filter(Boolean)
      .join(', ');
  }

  if (typeof cell === 'object') {
    if (typeof cell.text === 'string' && cell.text.length > 0) return cell.text;
    if (cell.rich_text) {
      const plain = richTextToPlain(cell.rich_text);
      if (plain) return plain;
    }
    if (cell.value !== undefined) return renderCellPlain(cell.value);
  }

  return '';
}

export function renderCellNode(cell: any, col?: SlackColumn): ReactNode {
  const type = col?.type;
  if (type === 'checkbox' || typeof cell === 'boolean') {
    const checked = cell === true || cell === 'true' || cell === 1;
    return checked
      ? <span className="inline-flex h-4 w-4 items-center justify-center rounded border border-primary bg-primary/20 text-primary text-[10px]">✓</span>
      : <span className="inline-flex h-4 w-4 rounded border border-border" />;
  }
  return renderCellPlain(cell, col);
}

/**
 * Map a select value to a stable color class.
 */
const PALETTE: Record<string, string> = {
  purple: 'bg-purple-500/15 text-purple-300 border-purple-500/30',
  green:  'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  red:    'bg-red-500/15 text-red-300 border-red-500/30',
  orange: 'bg-orange-500/15 text-orange-300 border-orange-500/30',
  yellow: 'bg-yellow-500/15 text-yellow-300 border-yellow-500/30',
  blue:   'bg-blue-500/15 text-blue-300 border-blue-500/30',
  pink:   'bg-pink-500/15 text-pink-300 border-pink-500/30',
  gray:   'bg-muted text-muted-foreground border-border',
};

/**
 * Returns an array of pills (label + tailwind class) for select/multi_select cells,
 * or null for other column types.
 */
export function getCellPills(
  cell: any,
  col?: SlackColumn,
): Array<{ id: string; label: string; className: string }> | null {
  if (!col || (col.type !== 'select' && col.type !== 'multi_select')) return null;
  const ids = extractOptionIds(cell);
  if (ids.length === 0) return [];
  const choices = getChoices(col);
  return ids.map((id) => {
    const ch = resolveOption(id, choices);
    const color = ch?.color || 'gray';
    return {
      id,
      label: ch?.label || ch?.name || id,
      className: PALETTE[color] || PALETTE.gray,
    };
  });
}

// Backwards-compat: old call sites pass (plainValue, options)
export function getCellPillClass(value: string, options?: any): string | null {
  if (!value) return null;
  const choices: SlackChoice[] = Array.isArray(options)
    ? options
    : Array.isArray(options?.choices)
      ? options.choices
      : [];
  const opt = choices.find(
    (o) => o.value?.toLowerCase() === value.toLowerCase() || o.id?.toLowerCase() === value.toLowerCase() || o.label?.toLowerCase() === value.toLowerCase(),
  );
  const color = opt?.color || (choices.length ? 'gray' : null);
  if (!color) return null;
  return PALETTE[color] || PALETTE.gray;
}


/**
 * Normalize a stored columns blob (array or object) into ColumnDef[].
 */
export function normalizeColumns(raw: any): SlackColumn[] {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw
      .map((c: any) => ({
        id: c.id || c.column_id || c.key,
        name: c.name || c.label || c.title || c.id || 'Spalte',
        type: c.type || c.column_type,
        options: c.options || c.choices,
      }))
      .filter((c) => c.id);
  }
  if (typeof raw === 'object') {
    return Object.entries(raw).map(([id, v]: [string, any]) => ({
      id,
      name: typeof v === 'string' ? v : (v?.name || v?.label || id),
      type: typeof v === 'object' ? v?.type : undefined,
      options: typeof v === 'object' ? v?.options : undefined,
    }));
  }
  return [];
}

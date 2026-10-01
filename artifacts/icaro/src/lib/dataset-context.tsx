import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

export type Cell = string | null;
export type DatasetRow = Record<string, Cell>;

export interface DatasetStats {
  numericColumns: string[];
  textColumns: string[];
  missingByColumn: Record<string, number>;
  numericSummary: Record<string, { min: number; max: number; average: number; count: number }>;
}

export interface Dataset {
  name: string;
  columns: string[];
  rows: DatasetRow[];
  sampleRows: DatasetRow[];
  stats: DatasetStats;
  summary: string;
}

interface DatasetContextValue {
  dataset: Dataset | null;
  isImporting: boolean;
  importError: string | null;
  importCsv: (file: File) => Promise<void>;
  clearDataset: () => void;
}

const DatasetContext = createContext<DatasetContextValue | undefined>(undefined);

const csvDelimiters = [',', ';', '\t'] as const;

function detectDelimiter(text: string) {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
  const counts = new Map<string, number>(csvDelimiters.map((delimiter) => [delimiter, 0]));
  let quoted = false;

  for (let index = 0; index < firstLine.length; index += 1) {
    const character = firstLine[index];
    const next = firstLine[index + 1];
    if (character === '"' && quoted && next === '"') {
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (!quoted && counts.has(character)) {
      counts.set(character, (counts.get(character) ?? 0) + 1);
    }
  }

  return csvDelimiters.reduce((best, delimiter) =>
    (counts.get(delimiter) ?? 0) > (counts.get(best) ?? 0) ? delimiter : best, ',');
}

function splitCsvLine(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    const next = line[index + 1];
    if (character === '"' && quoted && next === '"') {
      cell += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === delimiter && !quoted) {
      cells.push(cell.trim());
      cell = '';
    } else {
      cell += character;
    }
  }
  cells.push(cell.trim());
  return cells;
}

function splitCsvDocument(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let line = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"' && quoted && text[index + 1] === '"') {
      line += '""';
      index += 1;
      continue;
    }
    if (character === '"') quoted = !quoted;
    if ((character === '\n' || character === '\r') && !quoted) {
      if (line.trim()) rows.push(splitCsvLine(line, delimiter));
      line = '';
      if (character === '\r' && text[index + 1] === '\n') index += 1;
    } else {
      line += character;
    }
  }
  if (line.trim()) rows.push(splitCsvLine(line, delimiter));
  return rows;
}

function parseNumericCell(value: string | null, delimiter: string): number | null {
  if (value === null || !value.trim()) return null;
  let normalized = value.trim();
  const hasComma = normalized.includes(',');
  const hasDot = normalized.includes('.');

  if (hasComma && hasDot) {
    if (normalized.lastIndexOf(',') > normalized.lastIndexOf('.')) {
      normalized = normalized.replace(/\./g, '').replace(',', '.');
    } else {
      normalized = normalized.replace(/,/g, '');
    }
  } else if (hasComma) {
    const parts = normalized.split(',');
    const looksLikeThousands = delimiter === ',' && parts.length === 2 &&
      /^\d{1,3}$/.test(parts[0]) && /^\d{3}$/.test(parts[1]);
    normalized = looksLikeThousands ? parts.join('') : normalized.replace(',', '.');
  } else if (delimiter !== ',' && /^\d{1,3}(?:\.\d{3})+$/.test(normalized)) {
    normalized = normalized.replace(/\./g, '');
  }

  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

function buildDataset(name: string, text: string): Dataset {
  const cleanText = text.replace(/^\uFEFF/, '');
  const delimiter = detectDelimiter(cleanText);
  const rawRows = splitCsvDocument(cleanText, delimiter);
  if (rawRows.length < 2) throw new Error('O CSV precisa ter um cabeçalho e pelo menos uma linha.');
  const columns = rawRows[0].map((column, index) => column || `coluna_${index + 1}`);
  const rows = rawRows.slice(1).map((rawRow) => Object.fromEntries(
    columns.map((column, index) => [column, rawRow[index]?.trim() || null]),
  ));
  const missingByColumn = Object.fromEntries(columns.map((column) => [
    column,
    rows.filter((row) => row[column] === null).length,
  ]));
  const numericColumns = columns.filter((column) => {
    const values = rows.map((row) => row[column]).filter((value): value is string => value !== null && value !== '');
    return values.length > 0 && values.filter((value) => parseNumericCell(value, delimiter) !== null).length / values.length >= 0.8;
  });
  const numericSummary = Object.fromEntries(numericColumns.map((column) => {
    const values = rows
      .map((row) => parseNumericCell(row[column], delimiter))
      .filter((value): value is number => value !== null);
    const total = values.reduce((sum, value) => sum + value, 0);
    return [column, { min: Math.min(...values), max: Math.max(...values), average: total / values.length, count: values.length }];
  }));
  const textColumns = columns.filter((column) => !numericColumns.includes(column));
  const missingCount = Object.values(missingByColumn).reduce((sum, value) => sum + value, 0);
  const missingLabel = missingCount === 0 ? 'sem células vazias' : `${missingCount} célula${missingCount === 1 ? '' : 's'} vazia${missingCount === 1 ? '' : 's'}`;
  const summary = `${rows.length} linhas, ${columns.length} colunas, ${numericColumns.length} numérica${numericColumns.length === 1 ? '' : 's'} e ${missingLabel}.`;
  return {
    name,
    columns,
    rows,
    sampleRows: rows.slice(0, 12),
    stats: { numericColumns, textColumns, missingByColumn, numericSummary },
    summary,
  };
}

export function DatasetProvider({ children }: { children: ReactNode }) {
  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  const importCsv = async (file: File) => {
    setIsImporting(true);
    setImportError(null);
    try {
      const text = await file.text();
      setDataset(buildDataset(file.name, text));
    } catch (error) {
      setImportError(error instanceof Error ? error.message : 'Não foi possível ler este CSV.');
    } finally {
      setIsImporting(false);
    }
  };

  const value = useMemo(() => ({
    dataset, isImporting, importError, importCsv, clearDataset: () => setDataset(null),
  }), [dataset, isImporting, importError]);

  return <DatasetContext.Provider value={value}>{children}</DatasetContext.Provider>;
}

export function useDataset() {
  const context = useContext(DatasetContext);
  if (!context) throw new Error('useDataset must be used inside DatasetProvider');
  return context;
}

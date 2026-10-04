'use client';

import { useState, useEffect } from 'react';
import { DataGrid, Column } from 'react-data-grid';
import 'react-data-grid/lib/styles.css';
import { cn } from '@vivexy/ui/utils';

const TextEditor = (props: {
  row: Record<string, string>;
  column: { key: string };
  onRowChange: (row: Record<string, string>) => void;
  onClose: (close: boolean) => void;
}) => {
  return (
    <input
      autoFocus
      className="w-full h-full px-2 outline-none border-none text-sm bg-background text-foreground"
      value={props.row[props.column.key] as string}
      onChange={(e) =>
        props.onRowChange({ ...props.row, [props.column.key]: e.target.value })
      }
      onBlur={() => props.onClose(true)}
    />
  );
};

interface MultiSheetEditorProps {
  jsonData: string;
  onChange?: (json: string) => void;
  readonly?: boolean;
}

export function MultiSheetEditor({
  jsonData,
  onChange,
  readonly = false,
}: MultiSheetEditorProps) {
  const [sheets, setSheets] = useState<
    Record<string, Record<string, string>[]>
  >({});
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [activeSheet, setActiveSheet] = useState<string>('');
  const [columns, setColumns] = useState<Column<Record<string, string>>[]>([]);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [isInitializing, setIsInitializing] = useState(true);

  // Parse JSON to Sheets
  useEffect(() => {
    try {
      if (!jsonData) {
        setSheets({});
        setSheetNames([]);
        setActiveSheet('');
        setIsInitializing(false);
        return;
      }

      const parsed = JSON.parse(jsonData);

      if (
        typeof parsed !== 'object' ||
        parsed === null ||
        Array.isArray(parsed)
      ) {
        throw new Error(
          'Invalid structure for multi-sheet. Expected object mapping sheet names to arrays.'
        );
      }

      const names = Object.keys(parsed);

      // Normalize rows to always have an id string, needed for DataGrid
      const normalizedSheets: Record<string, Record<string, string>[]> = {};
      names.forEach((name) => {
        const sheetData = Array.isArray(parsed[name]) ? parsed[name] : [];
        normalizedSheets[name] = sheetData.map(
          (row: Record<string, string>, i: number) => ({
            ...row,
            _id: i.toString(),
          })
        );
      });

      setSheets(normalizedSheets);
      setSheetNames(names);

      if (names.length > 0 && !names.includes(activeSheet)) {
        setActiveSheet(names[0]);
      }
    } catch (e) {
      console.error('Failed to parse XLSX JSON payload', e);
    } finally {
      setIsInitializing(false);
    }
  }, [jsonData]); // Only re-run when external JSON data completely changes or initially loads

  // Update Grid when Active Sheet Changes
  useEffect(() => {
    if (!activeSheet) return;
    // sheets[activeSheet] may not exist yet if the parse effect hasn't committed — wait for it
    if (!sheets[activeSheet]) return;

    const sheetRows = sheets[activeSheet];
    setRows(sheetRows);

    if (sheetRows.length > 0) {
      // Infer headers from the first row's keys (excluding _id)
      const headers = Object.keys(sheetRows[0] || {}).filter(
        (k) => k !== '_id'
      );
      const gridColumns = headers.map((header) => ({
        key: header,
        name: header || 'Header', // Provide fallback for empty string keys
        renderEditCell: readonly ? undefined : TextEditor,
        resizable: true,
        minWidth: 100,
      }));
      setColumns(gridColumns);
    } else {
      setColumns([]);
    }
  }, [activeSheet, sheets, readonly]);

  const handleRowsChange = (newRows: Record<string, string>[]) => {
    if (readonly || !onChange || !activeSheet) return;

    setRows(newRows);

    const newSheets = {
      ...sheets,
      [activeSheet]: newRows,
    };
    setSheets(newSheets);

    // Serialize back to JSON, stripping _id internal property
    const cleanParsed: Record<string, Record<string, string>[]> = {};
    Object.keys(newSheets).forEach((name) => {
      cleanParsed[name] = newSheets[name].map((r) => {
        const copy = { ...r };
        delete copy._id;
        return copy;
      });
    });

    onChange(JSON.stringify(cleanParsed, null, 2));
  };

  if (isInitializing) {
    return (
      <div className="p-4 text-sm text-muted-foreground bg-muted/20 border border-border/50 rounded-lg animate-pulse w-full h-[300px]">
        Loading spreadsheet...
      </div>
    );
  }

  if (sheetNames.length === 0) {
    return (
      <div className="p-4 text-sm text-muted-foreground bg-muted/20 border border-border/50 rounded-lg w-full min-h-[100px] flex items-center justify-center">
        No sheet data available. Ensure the agent returned valid JSON format.
      </div>
    );
  }

  return (
    <div className="flex flex-col w-full h-full border rounded-lg overflow-hidden bg-background">
      {/* Tab Bar */}
      <div className="flex bg-muted/40 border-b border-border overflow-x-auto no-scrollbar shrink-0">
        {sheetNames.map((name) => (
          <button
            key={name}
            onClick={() => setActiveSheet(name)}
            className={cn(
              'px-4 py-2 text-xs font-medium border-b-2 transition-colors whitespace-nowrap',
              activeSheet === name
                ? 'border-primary text-foreground bg-background'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/80'
            )}
          >
            {name}
          </button>
        ))}
      </div>

      {/* Data Grid */}
      <div className="flex-1 min-h-0 relative">
        {columns.length > 0 ? (
          <DataGrid
            columns={columns}
            rows={rows}
            onRowsChange={handleRowsChange}
            className={cn(
              'h-full absolute inset-0 bg-background',
              readonly ? 'rdg-readonly' : ''
            )}
            rowKeyGetter={(row) => row._id}
          />
        ) : (
          <div className="flex items-center justify-center p-8 text-sm text-muted-foreground h-full absolute inset-0">
            This sheet is empty.
          </div>
        )}
      </div>

      {/* Add global CSS to disable cell selection visually if readonly */}
      {readonly && (
        <style
          dangerouslySetInnerHTML={{
            __html: `
                    .rdg-readonly .rdg-cell { cursor: default; }
                    .rdg-readonly .rdg-cell[aria-selected="true"] { outline: none !important; border-color: var(--border) !important; box-shadow: none !important; }
                `,
          }}
        />
      )}
    </div>
  );
}

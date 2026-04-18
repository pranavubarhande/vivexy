'use client';

import { useState, useEffect } from 'react';
import { DataGrid, Column } from 'react-data-grid';
import 'react-data-grid/lib/styles.css';

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

interface SpreadsheetEditorProps {
  csvData: string;
  onChange: (csv: string) => void;
}

export function SpreadsheetEditor({
  csvData,
  onChange,
}: SpreadsheetEditorProps) {
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [columns, setColumns] = useState<Column<Record<string, string>>[]>([
    { key: 'col1', name: 'Header 1', renderEditCell: TextEditor },
  ]);
  const [isInitializing, setIsInitializing] = useState(true);

  // Parse CSV to Grid format
  useEffect(() => {
    try {
      if (!csvData) {
        setRows([]);
        setIsInitializing(false);
        return;
      }

      const lines = csvData.split('\n');
      if (lines.length === 0) return;

      const headers = lines[0].split(',').map((h) => h.trim());
      const gridColumns = headers.map((header) => ({
        key: header,
        name: header,
        renderEditCell: TextEditor,
        resizable: true,
      }));

      const gridRows = lines
        .slice(1)
        .filter((l) => l.trim())
        .map((line, rowIndex) => {
          const values = line.split(',');
          const rowData: Record<string, string> = { id: rowIndex.toString() };
          headers.forEach((header, idx) => {
            rowData[header] = values[idx]?.trim() || '';
          });
          return rowData;
        });

      setColumns(gridColumns);
      setRows(gridRows);
    } catch (e) {
      console.error('Failed to parse CSV', e);
    } finally {
      setIsInitializing(false);
    }
  }, [csvData]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleRowsChange = (newRows: any[]) => {
    setRows(newRows);

    // Serialize back to CSV
    if (columns.length === 0) return;
    const headerLine = columns.map((c) => c.key).join(',');
    const dataLines = newRows.map((row) =>
      columns.map((c) => row[c.key] || '').join(',')
    );
    onChange([headerLine, ...dataLines].join('\n'));
  };

  if (isInitializing) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        Loading spreadsheet...
      </div>
    );
  }

  return (
    <div className="w-full h-full border rounded-lg overflow-hidden bg-background">
      <DataGrid
        columns={columns}
        rows={rows}
        onRowsChange={handleRowsChange}
        className="h-full bg-background"
        rowKeyGetter={(row) => row.id}
      />
    </div>
  );
}

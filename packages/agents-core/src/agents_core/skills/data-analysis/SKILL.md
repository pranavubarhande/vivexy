---
name: data-analysis
description: 'Use this skill for any task that involves loading, comparing, reconciling, or generating reports from tabular data files (CSV, Excel). Trigger when the user wants to: load or explore CSV or Excel files; compare values across two or more data sources; find discrepancies, mismatches, or differences in any numeric or categorical columns; produce reconciliation, summary, or root-cause-analysis reports as Excel or CSV output; perform date-aligned or key-aligned joins between tabular sources; apply threshold-based pass/fail checks; aggregate or pivot tabular data; or clean and standardise messy tabular input. Do NOT trigger for simple single-file reads where no comparison or report output is needed, for stock-market data fetched from APIs, or for PDF/DOCX/PPTX creation where no tabular source file is involved.'
license: Proprietary
---

# Data Analysis & Tabular Report Generation

## Dependencies

`pip install pandas openpyxl xlrd`

## Step 0 — Discover available files

Before loading anything, check what is in the sandbox:

```python
import os, glob
print(sorted(os.listdir('./')))
```

Use `list_sandbox_files` tool to confirm file names and sizes.

---

## Loading tabular files

### CSV

```python
import pandas as pd

df = pd.read_csv('./file.csv')
# Parse a date column if present
if 'date' in df.columns:
    df['date'] = pd.to_datetime(df['date'], dayfirst=True, errors='coerce')
    df = df.sort_values('date').reset_index(drop=True)
print(df.shape, df.columns.tolist())
print(df.head(3))
```

### Excel — single sheet

```python
df = pd.read_excel('./file.xlsx', sheet_name='Sheet1')
```

### Excel — all sheets

```python
sheets = pd.read_excel('./file.xlsx', sheet_name=None)  # dict {name: DataFrame}
for name, df in sheets.items():
    print(name, df.shape)
```

### Combine matching sheets across multiple Excel files

```python
import glob

def load_sheets_matching(pattern, sheet_keyword):
    dfs = []
    for path in sorted(glob.glob(pattern)):
        xls = pd.read_excel(path, sheet_name=None)
        for name, df in xls.items():
            if sheet_keyword.lower() in name.lower():
                df['_source_file'] = path
                dfs.append(df)
    return pd.concat(dfs, ignore_index=True) if dfs else pd.DataFrame()

df_combined = load_sheets_matching('./*.xlsx', 'Daily PnL')
```

---

## Cleaning data

### Strip commas and whitespace from numeric columns

```python
def clean_numeric(df):
    for col in df.columns:
        if df[col].dtype == object:
            cleaned = (df[col].astype(str)
                       .str.replace(',', '', regex=False)
                       .str.replace(' ', '', regex=False)
                       .str.strip())
            converted = pd.to_numeric(cleaned, errors='coerce')
            if converted.notna().sum() > len(df) * 0.3:   # only replace if mostly numeric
                df[col] = converted
    return df
```

### Normalise a column name (case/whitespace-insensitive lookup)

```python
def find_col(df, keyword):
    """Return the first column whose name contains keyword (case-insensitive)."""
    keyword = keyword.lower()
    return next((c for c in df.columns if keyword in c.lower()), None)

date_col = find_col(df, 'date')
if date_col and date_col != 'date':
    df = df.rename(columns={date_col: 'date'})
```

---

## Key-aligned comparison (date or any join key)

```python
JOIN_KEY = 'date'   # change to any common key
THRESHOLD = 50      # acceptable absolute difference

# Source A: CSV
df_a = pd.read_csv('./source_a.csv')
df_a[JOIN_KEY] = pd.to_datetime(df_a[JOIN_KEY], errors='coerce')

# Source B: Excel
df_b = pd.read_excel('./source_b.xlsx', sheet_name='Sheet1')
df_b[JOIN_KEY] = pd.to_datetime(df_b[JOIN_KEY], errors='coerce')

# Outer join so missing rows surface
df = df_a.merge(df_b, on=JOIN_KEY, how='outer', suffixes=('_a', '_b'))
df = df.sort_values(JOIN_KEY).reset_index(drop=True)

# Compute difference and threshold flag
df['difference'] = df['metric_a'] - df['metric_b']       # rename metric columns
df['within_threshold'] = df['difference'].abs() <= THRESHOLD
df['incremental_diff'] = df['difference'].diff()          # day-over-day change
df['within_incr_threshold'] = df['incremental_diff'].abs() <= THRESHOLD

print(df[~df['within_threshold']])
```

---

## Root cause analysis

For every row that fails the threshold, identify which component columns drive the gap:

```python
# component_pairs: list of (col_in_a, col_in_b, human_readable_label)
component_pairs = [
    ('col_a_1', 'col_b_1', 'Label 1'),
    ('col_a_2', 'col_b_2', 'Label 2'),
]

def root_cause(row, pairs, threshold=50):
    causes = []
    for a_col, b_col, label in pairs:
        a_val = row.get(a_col, 0) or 0
        b_val = row.get(b_col, 0) or 0
        diff = abs(a_val - b_val)
        if diff > threshold:
            causes.append(f'{label}: Δ={diff:,.0f}')
    return '; '.join(causes) if causes else ''

mask = ~df['within_threshold'].fillna(False)
df.loc[mask, 'Root Cause'] = df[mask].apply(root_cause, pairs=component_pairs, axis=1)
```

---

## Writing Excel reports with openpyxl

```python
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment
from openpyxl.utils import get_column_letter

HEADER_FILL  = PatternFill('solid', start_color='1F4E79')
HEADER_FONT  = Font(bold=True, color='FFFFFF', name='Arial', size=10)
PASS_FILL    = PatternFill('solid', start_color='C6EFCE')   # green
FAIL_FILL    = PatternFill('solid', start_color='FFC7CE')   # red
BODY_FONT    = Font(name='Arial', size=10)
CENTER       = Alignment(horizontal='center')

def df_to_sheet(ws, df, threshold_col=None):
    """Write DataFrame to openpyxl worksheet with header formatting."""
    cols = list(df.columns)

    # Header
    for c_idx, col in enumerate(cols, start=1):
        cell = ws.cell(row=1, column=c_idx, value=col)
        cell.fill = HEADER_FILL
        cell.font = HEADER_FONT
        cell.alignment = Alignment(horizontal='center', wrap_text=True)

    # Rows
    for r_idx, row in enumerate(df.itertuples(index=False), start=2):
        for c_idx, val in enumerate(row, start=1):
            # Convert numpy/pandas types to native Python
            if hasattr(val, 'item'):
                val = val.item()
            cell = ws.cell(row=r_idx, column=c_idx, value=val)
            cell.font = BODY_FONT
            cell.alignment = CENTER

        # Colour threshold column
        if threshold_col and threshold_col in cols:
            t_col = cols.index(threshold_col) + 1
            t_cell = ws.cell(row=r_idx, column=t_col)
            t_cell.fill = PASS_FILL if t_cell.value else FAIL_FILL

    # Column widths
    for c_idx, col in enumerate(cols, start=1):
        ws.column_dimensions[get_column_letter(c_idx)].width = max(len(str(col)) + 4, 14)

def save_report(sheets_dict, output_path):
    """
    sheets_dict: {sheet_name: {'df': DataFrame, 'threshold_col': str or None}}
    """
    wb = Workbook()
    wb.remove(wb.active)   # remove default empty sheet
    for sheet_name, cfg in sheets_dict.items():
        ws = wb.create_sheet(title=sheet_name)
        df_to_sheet(ws, cfg['df'], threshold_col=cfg.get('threshold_col'))
    wb.save(output_path)
    print(f'Saved: {output_path}')
```

Usage:

```python
save_report({
    'PnL Comparison': {
        'df': df_pnl_comparison,
        'threshold_col': 'within_threshold',
    },
    'NAV Comparison': {
        'df': df_nav_comparison,
        'threshold_col': 'within_threshold',
    },
}, './comparison_report.xlsx')
```

---

## Full single-script pipeline (template)

```python
import pandas as pd, glob, os
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment
from openpyxl.utils import get_column_letter

# ── helpers ──────────────────────────────────────────────────────────────────

def clean_numeric(df):
    for col in df.columns:
        if df[col].dtype == object:
            s = df[col].astype(str).str.replace(',','',regex=False).str.strip()
            c = pd.to_numeric(s, errors='coerce')
            if c.notna().sum() > len(df) * 0.3:
                df[col] = c
    return df

def find_col(df, kw):
    return next((c for c in df.columns if kw.lower() in c.lower()), None)

def root_cause(row, pairs, thr=50):
    causes = []
    for a, b, lbl in pairs:
        diff = abs((row.get(a) or 0) - (row.get(b) or 0))
        if diff > thr:
            causes.append(f'{lbl}: Δ={diff:,.0f}')
    return '; '.join(causes)

# ── load sources ──────────────────────────────────────────────────────────────

print('Files:', sorted(os.listdir('./')))

df_csv = clean_numeric(pd.read_csv('./source.csv'))
df_csv['date'] = pd.to_datetime(df_csv['date'], errors='coerce')

excel_files = sorted(glob.glob('./*.xlsx'))
print('Excel files:', excel_files)

pnl_dfs = []
for f in excel_files:
    xls = pd.read_excel(f, sheet_name=None)
    sheet = next((v for k,v in xls.items() if 'pnl' in k.lower()), None)
    if sheet is not None:
        pnl_dfs.append(clean_numeric(sheet))

df_excel = pd.concat(pnl_dfs, ignore_index=True) if pnl_dfs else pd.DataFrame()
if not df_excel.empty:
    dc = find_col(df_excel, 'date')
    if dc:
        df_excel = df_excel.rename(columns={dc: 'date'})
    df_excel['date'] = pd.to_datetime(df_excel['date'], errors='coerce')
    df_excel = df_excel.sort_values('date').drop_duplicates('date').reset_index(drop=True)

# ── compare ───────────────────────────────────────────────────────────────────

THRESHOLD = 50
csv_metric  = 'csv_metric_column'    # ← replace with actual column name
excel_metric = 'Excel Metric Column' # ← replace with actual column name

df = df_csv[['date', csv_metric]].merge(
    df_excel[['date', excel_metric]],
    on='date', how='outer'
).sort_values('date').reset_index(drop=True)

df['Difference'] = df[csv_metric] - df[excel_metric]
df['Within Threshold'] = df['Difference'].abs() <= THRESHOLD

pairs = [
    (csv_metric, excel_metric, 'Main Metric'),
    # add more component pairs for root cause
]
mask = ~df['Within Threshold'].fillna(False)
df.loc[mask, 'Root Cause'] = df[mask].apply(
    lambda r: root_cause(r, pairs), axis=1
)

print(df.head())
print('Rows outside threshold:', mask.sum())

# ── write report ──────────────────────────────────────────────────────────────

from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment
from openpyxl.utils import get_column_letter

wb = Workbook()
ws = wb.active
ws.title = 'Comparison'

H_FILL = PatternFill('solid', start_color='1F4E79')
H_FONT = Font(bold=True, color='FFFFFF', name='Arial', size=10)
P_FILL = PatternFill('solid', start_color='C6EFCE')
F_FILL = PatternFill('solid', start_color='FFC7CE')

cols_out = [c for c in df.columns]
for i, c in enumerate(cols_out, 1):
    cell = ws.cell(row=1, column=i, value=c)
    cell.fill = H_FILL; cell.font = H_FONT
    cell.alignment = Alignment(horizontal='center', wrap_text=True)

for r, row in enumerate(df.itertuples(index=False), 2):
    for i, val in enumerate(row, 1):
        if hasattr(val, 'item'): val = val.item()
        c = ws.cell(row=r, column=i, value=val)
        c.font = Font(name='Arial', size=10)
        c.alignment = Alignment(horizontal='center')
    thr_idx = cols_out.index('Within Threshold') + 1
    ws.cell(row=r, column=thr_idx).fill = (
        P_FILL if ws.cell(row=r, column=thr_idx).value else F_FILL
    )

for i, c in enumerate(cols_out, 1):
    ws.column_dimensions[get_column_letter(i)].width = max(len(str(c))+4, 14)

wb.save('./report.xlsx')
print('Saved ./report.xlsx')
```

---

## Tips

- Always print `df.shape`, `df.columns.tolist()`, and `df.head(3)` in early explore steps so you know the exact column names before referencing them.
- Use `pd.to_numeric(..., errors='coerce')` — never crash on non-numeric values.
- For date parsing, prefer `errors='coerce'` and drop/inspect NaT rows before joining.
- For Excel output, use `data_only=True` only when reading values from formulas; never save with `data_only=True` if you want to keep formulas.
- After writing a file with openpyxl, always call `upload_sandbox_file_to_chat('./filename.xlsx')` to make it visible.

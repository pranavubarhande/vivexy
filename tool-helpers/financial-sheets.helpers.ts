import axios from 'axios';
import * as cheerio from 'cheerio';
import { HEADERS } from './headers.helpers';

export const parseHtmlTableToRows = (
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  table: cheerio.Cheerio<any>,
  $: cheerio.CheerioAPI
): { headers: string[]; rows: Record<string, string>[] } => {
  let headers: string[] = [];

  const thead = table.find('thead');
  if (thead.length > 0) {
    headers = thead
      .find('th')
      .map((_, el) => $(el).text().trim())
      .get();
  }

  if (headers.length === 0) {
    const firstRow = table.find('tr').first();
    headers = firstRow
      .find('th, td')
      .map((_, el) => $(el).text().trim())
      .get();
  }

  const bodyRows: Record<string, string>[] = [];
  const trs = table.find('tr');
  const startIdx = headers.length > 0 ? 1 : 0;

  trs.slice(startIdx).each((_, tr) => {
    const tds = $(tr).find('td');
    if (tds.length === 0) return;

    const values = tds.map((_, td) => $(td).text().trim()).get();
    const row: Record<string, string> = {};
    values.forEach((v, i) => {
      const col = headers[i] || `col_${i + 1}`;
      row[col] = v;
    });

    bodyRows.push(row);
  });

  return { headers, rows: bodyRows };
};

export const findTableByHeadingHtml = (
  $: cheerio.CheerioAPI,
  headingTexts: string[]
) => {
  for (const ht of headingTexts) {
    const sectionId = `#${ht.toLowerCase().replace(/\s+/g, '-').replace(/&/g, '')}`;
    const section = $(sectionId);
    if (section.length) {
      const table =
        section.find('table.data-table').first() ||
        section.find('table').first();
      if (table && table.length) return table;
    }

    const re = new RegExp(ht.replace(/\s+/g, '.*').replace(/&/g, ''), 'i');
    const byId = $('[id]')
      .filter((i, el) => re.test($(el).attr('id') || ''))
      .first();
    if (byId && byId.length) {
      const t =
        byId.find('table.data-table').first() || byId.find('table').first();
      if (t && t.length) return t;
    }
  }

  for (const tag of ['h1', 'h2', 'h3', 'h4', 'h5']) {
    const nodes = $(tag).toArray();
    for (const n of nodes) {
      const title = $(n).text().trim().toLowerCase();
      for (const ht of headingTexts) {
        if (title.includes(ht.toLowerCase())) {
          const parent = $(n).parent();
          const parentTable =
            parent.find('table.data-table').first() ||
            parent.find('table').first();
          if (parentTable && parentTable.length) return parentTable;

          let sibling: unknown | null =
            (n as unknown as { next?: unknown }).next ?? null;
          let steps = 0;
          while (sibling && steps < 20) {
            const $s = $(sibling as never);
            const t1 = $s.find('table.data-table').first();
            if (t1 && t1.length) return t1;
            const t2 = $s.is('table') ? $s : $s.find('table').first();
            if (t2 && t2.length) return t2;
            sibling = (sibling as { next?: unknown }).next ?? null;
            steps++;
          }
        }
      }
    }
  }

  for (const ht of headingTexts) {
    const re = new RegExp(ht.replace(/\s+/g, '.*').replace(/&/g, ''), 'i');
    const byClass = $('[class]')
      .filter((i, el) => re.test($(el).attr('class') || ''))
      .first();
    if (byClass && byClass.length) {
      const t =
        byClass.find('table.data-table').first() ||
        byClass.find('table').first();
      if (t && t.length) return t;
    }
  }

  let foundTable: cheerio.Cheerio<unknown> | null = null;

  for (const ht of headingTexts) {
    $('b, strong').each((_, el) => {
      const text = $(el).text().trim().toLowerCase();
      if (text.includes(ht.toLowerCase())) {
        const parent = $(el).parent();
        const table =
          parent.next('table').first() || parent.find('table').first();
        if (table && table.length) {
          foundTable = table;
          return false as unknown as void;
        }
      }
    });
    if (foundTable) break;
  }

  return foundTable;
};

export const scrapeFinancialSheets = async (companyUrl: string) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result: Record<string, any> = {
    balance_sheet: null,
    profit_loss: null,
    cash_flow: null,
    quarterly_results: null,
    ratios: null,
    shareholding_pattern: null,
  };

  try {
    const response = await axios.get(companyUrl, {
      headers: HEADERS,
      timeout: 20000,
    });
    const $ = cheerio.load(response.data);

    const targets: Array<[string[], keyof typeof result]> = [
      [['balance-sheet', 'Balance Sheet', 'balance sheet'], 'balance_sheet'],
      [['profit-loss', 'Profit & Loss', 'Profit and Loss'], 'profit_loss'],
      [['cash-flow', 'Cash Flow', 'cash flow'], 'cash_flow'],
      [['quarters', 'Quarterly Results', 'quarterly'], 'quarterly_results'],
      [['ratios', 'Ratios'], 'ratios'],
      [['shareholding', 'Shareholding Pattern'], 'shareholding_pattern'],
    ];

    for (const [headings, key] of targets) {
      const table = findTableByHeadingHtml($, headings);
      if (!table) {
        console.log(`Table not found for: ${headings.join(', ')}`);
        continue;
      }

      const parsed = parseHtmlTableToRows(table, $);
      const headers =
        parsed.headers.length > 0
          ? parsed.headers
          : parsed.rows.length > 0
            ? Object.keys(parsed.rows[0])
            : [];

      if (headers.length > 0 && parsed.rows.length > 0) {
        result[key] = {
          headers,
          rows: parsed.rows,
        };
      }
    }

    return result;
  } catch (error) {
    console.error('Error scraping financial sheets:', error);
    return result;
  }
};

export const getFinancialSheets = async (stock: string, subtype?: string) => {
  try {
    const companyUrl = `https://www.screener.in/company/${stock}/consolidated/`;
    const sheets = await scrapeFinancialSheets(companyUrl);

    if (!subtype) {
      return {
        success: true,
        stock,
        type: 'financial_sheets',
        data: sheets,
      };
    }

    // Specific sheet
    const sheetData = sheets[subtype as keyof typeof sheets];
    if (!sheetData) {
      throw new Error(
        `Sheet '${subtype}' not found. Available: ${Object.keys(sheets)
          .filter((k) => sheets[k])
          .join(', ')}`
      );
    }

    return {
      success: true,
      stock,
      type: 'financial_sheet',
      subtype,
      data: JSON.stringify(sheetData),
    };
  } catch (error) {
    throw new Error(
      `Error getting financial sheets for ${stock}: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
};

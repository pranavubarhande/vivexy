import axios from 'axios';
import * as cheerio from 'cheerio';
import { parseStringPromise } from 'xml2js';

export const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0 Safari/537.36',
};

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

export const scrapeFundamentals = async (
  companyUrl: string
): Promise<Record<string, string>> => {
  try {
    const response = await axios.get(companyUrl, {
      headers: HEADERS,
      timeout: 20000,
    });
    const $ = cheerio.load(response.data);

    const keys = [
      'Market Cap',
      'Current Price',
      'Stock P/E',
      'Book Value',
      'Dividend Yield',
      'ROCE',
      'ROE',
      'Face Value',
      'Debt to equity',
      'Sales growth',
      'Profit growth',
      'EPS',
      'OPM',
      'NPM',
    ];

    const metrics: Record<string, string> = {};
    $('table.data-table').each((_, table) => {
      $(table)
        .find('tr')
        .each((_, tr) => {
          const th = $(tr).find('th').first();
          const tds = $(tr).find('td');
          if (th.length > 0 && tds.length > 0) {
            const label = th.text().trim();
            const val = $(tds[0]).text().trim();
            if (label) metrics[label] = val;
          }
        });
    });

    const filtered: Record<string, string> = {};
    for (const k of keys) {
      if (metrics[k]) filtered[k] = metrics[k];
    }

    return filtered;
  } catch (error) {
    console.error('Error scraping fundamentals:', error);
    return { error: String(error) } as unknown as Record<string, string>;
  }
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

export const getGoogleNews = async (query: string, count = 10) => {
  try {
    const encodedQuery = encodeURIComponent(`${query} stock`);
    const url = `https://news.google.com/rss/search?q=${encodedQuery}&hl=en-IN&gl=IN&ceid=IN:en`;
    const response = await axios.get(url, { headers: HEADERS, timeout: 15000 });

    const result = await parseStringPromise(response.data, {
      explicitArray: false,
    });
    const items = result?.rss?.channel?.item || [];
    const newsItems = (Array.isArray(items) ? items : [items]) as Array<{
      title?: string | { _: string };
      link?: string | { _: string };
      pubDate?: string;
    }>;

    return newsItems.slice(0, count).map((item) => ({
      title:
        typeof item.title === 'object' ? item.title._ || '' : item.title || '',
      link: typeof item.link === 'object' ? item.link._ || '' : item.link || '',
      published_at: item.pubDate ? new Date(item.pubDate).toISOString() : '',
    }));
  } catch (error) {
    console.error('Error fetching news:', error);
    return [] as const;
  }
};

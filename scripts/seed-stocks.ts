import axios from 'axios';
import * as cheerio from 'cheerio';
import { prisma } from '../lib/prisma';

const baseUrl = 'https://www.screener.in/screens/3230898/all-stocks/';

const headers = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
};

interface StockRow {
  data: string[];
  name: string;
  link: string;
}

const scrapePage = async (
  url: string
): Promise<{ headers: string[]; stockRows: StockRow[] }> => {
  try {
    const response = await axios.get(url, { headers });
    const $ = cheerio.load(response.data);

    // Find the table - Screener.in typically uses table with class 'data-table'
    let table = $('table.data-table');

    if (table.length === 0) {
      table = $('table');
    }

    if (table.length === 0) {
      return { headers: [], stockRows: [] };
    }

    // Extract headers
    let headerList: string[] = [];
    const headerRow = table.find('thead');
    if (headerRow.length > 0) {
      headerList = headerRow
        .find('th')
        .map((_, th) => $(th).text().trim())
        .get();
    } else {
      const firstRow = table.find('tr').first();
      if (firstRow.length > 0) {
        headerList = firstRow
          .find('th, td')
          .map((_, cell) => $(cell).text().trim())
          .get();
      }
    }

    // Determine the index of the Name column (fallback to first column if not found)
    let nameColIdx = 0;
    if (headerList.length > 0) {
      const lowered = headerList.map((h) => h.toLowerCase());
      for (const key of ['name', 'company']) {
        const index = lowered.indexOf(key);
        if (index !== -1) {
          nameColIdx = index;
          break;
        }
      }
    }

    // Extract rows and capture links
    const stockRows: StockRow[] = [];

    const tbody = table.find('tbody');
    const rowElements =
      tbody.length > 0 ? tbody.find('tr') : table.find('tr').slice(1);

    rowElements.each((_, tr) => {
      const tds = $(tr).find('td');
      if (tds.length === 0) return;

      // Extract all cell values
      const rowVals = tds.map((_, td) => $(td).text().trim()).get();

      let stockName = '';
      let stockLink = '';

      // Extract name and link from the name column
      if (nameColIdx >= 0 && nameColIdx < tds.length) {
        const nameCell = tds.eq(nameColIdx);
        const anchor = nameCell.find('a[href]');

        if (anchor.length > 0) {
          const href = anchor.attr('href');
          if (href) {
            // Get the actual text from the anchor tag
            stockName = anchor.text().trim();
            // Ensure absolute URL
            stockLink = href.startsWith('http')
              ? href
              : `https://www.screener.in${href}`;
            // Update the row value with the correct name from anchor
            rowVals[nameColIdx] = stockName;
          }
        }

        // Fallback to cell text if no anchor found
        if (!stockName) {
          stockName = rowVals[nameColIdx];
        }
      }

      // Only add rows that have a valid name and link
      if (stockName && stockLink) {
        stockRows.push({
          data: rowVals,
          name: stockName,
          link: stockLink,
        });
      }
    });

    return { headers: headerList, stockRows };
  } catch (error) {
    console.error(`Error scraping ${url}:`, error);
    return { headers: [], stockRows: [] };
  }
};

const parseStockData = (
  headers: string[],
  rowData: string[],
  name: string,
  link: string
): Record<string, string | Date> | null => {
  const stockBase = {
    name: name,
    symbol: '',
    link,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  // Extract symbol from URL
  // URL format: https://www.screener.in/company/RELIANCE/consolidated/ or https://www.screener.in/company/490944/consolidated/
  const urlMatch = link.match(/\/company\/([^\/]+)\//);
  if (urlMatch && urlMatch[1]) {
    stockBase.symbol = urlMatch[1];
  }

  // Map common column names to database fields
  const fieldMapping: Record<string, string> = {
    name: 'name',
    company: 'name',
    cmp: 'cmp',
    'current price': 'cmp',
    price: 'cmp',
    'p/e': 'pe',
    'mar cap': 'marketCap',
    'market cap': 'marketCap',
    'div yld %': 'divYldPct',
    'dividend yield': 'divYldPct',
    'np qtr': 'npQtrCr',
    'qtr profit var %': 'qtrProfitVarPct',
    'qtr sales var %': 'qtrSalesVarPct',
    'sales qtr': 'salesQtrCr',
    'roce %': 'rocePct',
  };

  // Build the data object to insert
  const stockData: Record<string, string | Date> = {
    ...stockBase,
  };

  headers.forEach((header, index) => {
    const lowerHeader = header.toLowerCase().replace(/\s+/g, ' ').trim();
    const dbField = fieldMapping[lowerHeader];

    if (dbField && index < rowData.length && rowData[index]) {
      // Skip fields that are already set in stockBase
      if (
        dbField === 'symbol' ||
        dbField === 'createdAt' ||
        dbField === 'updatedAt'
      ) {
        return;
      }
      stockData[dbField] = rowData[index];
    }
  });

  // If we don't have a name, we can't create a stock
  if (!stockBase.name) {
    return null;
  }

  return { ...stockData };
};

const scrapeAndSeedStocks = async () => {
  let columnHeaders: string[] | null = null;
  let page = 1;
  const maxPages = 208; // Total pages available on screener.in

  // Clear existing stocks table for fresh start
  console.log('🧹 Clearing existing stocks table...');
  try {
    await prisma.stock.deleteMany();
    console.log('✅ Stocks table cleared successfully');
  } catch (error: unknown) {
    console.log(
      '⚠️  Could not clear stocks table (might be empty already):',
      error instanceof Error ? error.message : String(error)
    );
  }

  let totalInserted = 0;
  let totalSkipped = 0;
  const allStockRows: StockRow[] = [];

  console.log('Starting to scrape and insert stocks page by page...');
  console.log('-'.repeat(60));

  while (page <= maxPages) {
    // Construct URL for current page
    const url = page === 1 ? baseUrl : `${baseUrl}?page=${page}`;

    console.log(`\n📄 Scraping page ${page}: ${url}`);

    const { headers: headersFromPage, stockRows } = await scrapePage(url);

    if (!stockRows || stockRows.length === 0) {
      console.log(`No data found on page ${page}. Stopping.`);
      break;
    }

    // Store headers from first page
    if (columnHeaders === null) {
      columnHeaders = headersFromPage;
    }

    // Store all stock rows for CSV backup
    allStockRows.push(...stockRows);

    console.log(`  ✓ Scraped ${stockRows.length} rows from page ${page}`);

    // Process stocks from this page immediately
    console.log(`  🔄 Inserting stocks from page ${page}...`);
    let pageInserted = 0;
    let pageSkipped = 0;

    for (let i = 0; i < stockRows.length; i++) {
      const stockRow = stockRows[i];
      const stockInfo = parseStockData(
        columnHeaders || [],
        stockRow.data,
        stockRow.name,
        stockRow.link
      );

      if (!stockInfo) {
        console.log(`    ⚠️  Could not parse data for ${stockRow.name}`);
        pageSkipped++;
        continue;
      }

      // Only show debug for first 2 stocks per page to avoid too much output
      if (i < 2) {
        console.log(
          `    🔍 Processing: ${stockInfo.name} (${String(stockInfo.symbol)})`
        );
      }

      try {
        // Check if stock already exists by symbol only (to allow both BSE and NSE versions)
        let existingStock = null;
        if (
          stockInfo.symbol &&
          typeof stockInfo.symbol === 'string' &&
          stockInfo.symbol.trim() !== ''
        ) {
          existingStock = await prisma.stock.findFirst({
            where: {
              symbol: stockInfo.symbol,
            },
          });
        }

        if (existingStock) {
          pageSkipped++;
          if (i < 3) {
            // Show first 3 skips per page
            console.log(
              `    ⏭️  ${stockInfo.name} (${String(stockInfo.symbol)}) already exists, skipping`
            );
          }
          continue;
        }

        await prisma.stock.create({
          data: stockInfo as unknown as Parameters<
            typeof prisma.stock.create
          >[0]['data'],
        });
        pageInserted++;
        if (i < 3) {
          // Show first 3 inserts per page
          console.log(
            `    ✅ Inserted: ${stockInfo.name} (${String(stockInfo.symbol)})`
          );
        }
      } catch (error) {
        console.error(`    ❌ Error inserting ${stockRow.name}:`, error);
        pageSkipped++;
      }
    }

    totalInserted += pageInserted;
    totalSkipped += pageSkipped;

    console.log(
      `  📊 Page ${page} complete: ${pageInserted} inserted, ${pageSkipped} skipped`
    );

    page++;

    // Be respectful to the server - add a delay between pages
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  console.log('\n' + '='.repeat(60));
  console.log('🎉 SEEDING COMPLETE!');
  console.log('='.repeat(60));
  console.log(`📈 Total Results:`);
  console.log(`   ✅ Inserted: ${totalInserted} stocks`);
  console.log(`   ⏭️  Skipped: ${totalSkipped} stocks`);
  console.log(`   📄 Pages processed: ${page - 1}`);
  console.log('='.repeat(60));
};

// Run the script
scrapeAndSeedStocks()
  .then(() => {
    console.log('Script completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Script failed:', error);
    process.exit(1);
  });

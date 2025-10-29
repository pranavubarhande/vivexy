import { NextRequest, NextResponse } from 'next/server';
import YahooFinance from 'yahoo-finance2';
import { scrapeFundamentals, scrapeFinancialSheets, getGoogleNews } from '@/business-logic/stockContext';

type HistoricalData = {
  date: Date;
  open?: number;
  high?: number;
  low?: number;
  close?: number;
  volume?: number;
};

const yahooFinance = new YahooFinance();

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const stock = searchParams.get('stock');
    const type = searchParams.get('type');
    const subtype = searchParams.get('subtype');
    const paramsRaw = searchParams.get('parameters');
    let parameters: Record<string, unknown> = {};
    if (paramsRaw) {
      try {
        parameters = JSON.parse(paramsRaw);
      } catch {
        return NextResponse.json({ error: 'Invalid parameters JSON' }, { status: 400 });
      }
    }

    if (!type)
      return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });

    const companyUrl = `https://www.screener.in/company/${stock}/consolidated/`;

    // Handle fundamentals
    if (type === 'fundamentals') {
      if (!stock) return NextResponse.json({ error: 'Missing stock' }, { status: 400 });
      if (!subtype) {
        const fundamentals = await scrapeFundamentals(companyUrl);
        return NextResponse.json({
          success: true,
          stock,
          type: 'fundamentals',
          data: fundamentals
        });
      }

      // Financial sheets
      const sheets = await scrapeFinancialSheets(companyUrl);
      if (subtype === 'all') {
        return NextResponse.json({
          success: true,
          stock,
          type: 'financial_sheets',
          data: sheets
        });
      }

      // Specific sheet
      const sheetData = sheets[subtype];
      if (!sheetData) {
        return NextResponse.json({
          success: false,
          error: `Sheet '${subtype}' not found`,
          available: Object.keys(sheets).filter(k => sheets[k])
        }, { status: 404 });
      }

      return NextResponse.json({
        success: true,
        stock,
        type: 'financial_sheet',
        subtype,
        data: sheetData
      });
    }

    // Handle news
    if (type === 'news') {
      if (!stock) return NextResponse.json({ error: 'Missing stock' }, { status: 400 });
      const count = Math.min(parseInt(String(parameters.count ?? '10'), 10), 20);
      const newsItems = await getGoogleNews(stock, count);
      return NextResponse.json({
        success: true,
        stock,
        type: 'news',
        count: newsItems.length,
        data: newsItems
      });
    }

    // Handle stock quotes
    if (type === 'quote') {
      if (!stock) return NextResponse.json({ error: 'Missing stock' }, { status: 400 });
      const interval = String(parameters.interval ?? '1d');
      const days = parseInt(String(parameters.days ?? '30'), 10);
      
      // Map intervals to yahoo-finance2 format (only '1d', '1wk', '1mo' are valid for historical data)
      const intervalMap: Record<string, '1d' | '1wk' | '1mo'> = {
        '1d': '1d',
        '1wk': '1wk',
        '1mo': '1mo'
      };
      
      // Default to '1d' if an invalid interval is provided
      const validInterval = interval in intervalMap ? interval as keyof typeof intervalMap : '1d';

      if (!(interval in intervalMap)) {
        console.warn(`Invalid interval '${interval}' provided, defaulting to '1d'`);
      }

      if (isNaN(days) || days < 1 || days > 3650) {
        return NextResponse.json(
          { error: 'Days must be a number between 1 and 3650' },
          { status: 400 }
        );
      }

      try {
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(endDate.getDate() - days);

        const queryOptions = {
          period1: Math.floor(startDate.getTime() / 1000),
          period2: Math.floor(endDate.getTime() / 1000),
          interval: intervalMap[validInterval],
        };

        const data = await yahooFinance.historical(stock, queryOptions);
        return NextResponse.json({
          success: true,
          stock,
          type: 'quote',
          interval,
          days,
          data: (data as HistoricalData[]).map((item) => ({
            date: item.date.toISOString(),
            open: item.open,
            high: item.high,
            low: item.low,
            close: item.close,
            volume: item.volume
          }))
        });
      } catch (error) {
        console.error('Error fetching stock quote:', error);
        return NextResponse.json(
          { 
            error: 'Failed to fetch stock quote', 
            details: error instanceof Error ? error.message : String(error) 
          },
          { status: 500 }
        );
      }
    }

    // Handle yfinance multi-endpoint proxy
    if (type === 'yfinance') {
      const ySubtype = subtype || '';
      const count = Math.min(parseInt(String(parameters.count ?? '10'), 10), 50);
      const supported = [
        'historical',
        'quote',
        'quoteSummary',
        'search',
        'insights',
        'options',
        'recommendationsBySymbol',
      ];

      if (!ySubtype || !supported.includes(ySubtype)) {
        return NextResponse.json({
          success: false,
          error: 'Invalid or missing subtype',
          available_subtypes: supported
        }, { status: 400 });
      }

      try {
        if (ySubtype === 'quote') {
          if (!stock) return NextResponse.json({ error: 'Missing stock' }, { status: 400 });
          const data = await yahooFinance.quote(stock);
          return NextResponse.json({ success: true, type: 'yfinance', subtype: ySubtype, stock, data });
        }

        if (ySubtype === 'quoteSummary') {
          if (!stock) return NextResponse.json({ error: 'Missing stock' }, { status: 400 });
          const modulesParam = String(parameters.modules ?? '');
          const allowedModules = [
            'assetProfile','balanceSheetHistory','balanceSheetHistoryQuarterly','calendarEvents','cashflowStatementHistory','cashflowStatementHistoryQuarterly','defaultKeyStatistics','earnings','earningsHistory','earningsTrend','financialData','fundOwnership','fundPerformance','fundProfile','incomeStatementHistory','incomeStatementHistoryQuarterly','indexTrend','industryTrend','insiderHolders','insiderTransactions','institutionOwnership','majorDirectHolders','majorHoldersBreakdown','netSharePurchaseActivity','price','quoteType','recommendationTrend','secFilings','sectorTrend','summaryDetail','summaryProfile','upgradeDowngradeHistory'
          ] as const;
          type AllowedModule = typeof allowedModules[number];
          const modules = modulesParam
            .split(',')
            .map((m) => m.trim())
            .filter((m): m is AllowedModule => (allowedModules as readonly string[]).includes(m) );
          if (!modules.length) {
            return NextResponse.json({
              success: false,
              error: 'modules parameter is required (comma-separated)',
            }, { status: 400 });
          }
          const data = await yahooFinance.quoteSummary(stock, { modules });
          return NextResponse.json({ success: true, type: 'yfinance', subtype: ySubtype, stock, modules, data });
        }

        if (ySubtype === 'historical') {
          if (!stock) return NextResponse.json({ error: 'Missing stock' }, { status: 400 });
          const interval = String(parameters.interval ?? '1d');
          const days = Math.min(parseInt(String(parameters.days ?? '30'), 10), 3650);
          const endDate = new Date();
          const startDate = new Date();
          startDate.setDate(endDate.getDate() - days);
          const intervalMap: Record<string, '1d' | '1wk' | '1mo'> = { '1d': '1d', '1wk': '1wk', '1mo': '1mo' };
          const validInterval = interval in intervalMap ? (interval as keyof typeof intervalMap) : '1d';
          const data = await yahooFinance.historical(stock, {
            period1: Math.floor(startDate.getTime() / 1000),
            period2: Math.floor(endDate.getTime() / 1000),
            interval: intervalMap[validInterval]
          });
          return NextResponse.json({ success: true, type: 'yfinance', subtype: ySubtype, stock, interval: intervalMap[validInterval], days, data });
        }

        

        if (ySubtype === 'search') {
          const q = String(parameters.q ?? '').trim();
          if (!q) {
            return NextResponse.json({ success: false, error: 'q parameter is required' }, { status: 400 });
          }
          const data = await yahooFinance.search(q, { quotesCount: count });
          return NextResponse.json({ success: true, type: 'yfinance', subtype: ySubtype, query: q, count, data });
        }

        

        if (ySubtype === 'insights') {
          if (!stock) return NextResponse.json({ error: 'Missing stock' }, { status: 400 });
          const data = await yahooFinance.insights(stock);
          return NextResponse.json({ success: true, type: 'yfinance', subtype: ySubtype, stock, data });
        }

        if (ySubtype === 'options') {
          if (!stock) return NextResponse.json({ error: 'Missing stock' }, { status: 400 });
          const dateParam = parameters.date as string | undefined;
          let data;
          if (dateParam) {
            const ts = parseInt(dateParam as string, 10);
            const d = isNaN(ts) ? undefined : new Date(ts * 1000);
            data = await yahooFinance.options(stock, d ? { date: d } : undefined);
          } else {
            data = await yahooFinance.options(stock);
          }
          return NextResponse.json({ success: true, type: 'yfinance', subtype: ySubtype, stock, data });
        }

        if (ySubtype === 'recommendationsBySymbol') {
          if (!stock) return NextResponse.json({ error: 'Missing stock' }, { status: 400 });
          const data = await yahooFinance.recommendationsBySymbol(stock);
          return NextResponse.json({ success: true, type: 'yfinance', subtype: ySubtype, stock, data });
        }

        return NextResponse.json({ error: 'Unhandled yfinance subtype' }, { status: 400 });
      } catch (error) {
        return NextResponse.json({ success: false, error: 'yfinance request failed', details: error instanceof Error ? error.message : String(error) }, { status: 500 });
      }
    }

    return NextResponse.json({ error: 'Unsupported type' }, { status: 400 });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Internal server error',
        details: String(error)
      },
      { status: 500 }
    );
  }
}
import YahooFinance from 'yahoo-finance2';

type HistoricalData = {
  date: Date;
  open?: number;
  high?: number;
  low?: number;
  close?: number;
  volume?: number;
};

const yahooFinance = new YahooFinance();

export const getStockQuote = async (
  stock: string,
  interval: string = '1d',
  days: number = 30
) => {
  try {
    // Map intervals to yahoo-finance2 format
    const intervalMap: Record<string, '1d' | '1wk' | '1mo'> = {
      '1d': '1d',
      '1wk': '1wk',
      '1mo': '1mo',
    };

    // Default to '1d' if an invalid interval is provided
    const validInterval =
      interval in intervalMap ? (interval as keyof typeof intervalMap) : '1d';

    if (!(interval in intervalMap)) {
      console.warn(
        `Invalid interval '${interval}' provided, defaulting to '1d'`
      );
    }

    if (isNaN(days) || days < 1 || days > 3650) {
      throw new Error('Days must be a number between 1 and 3650');
    }

    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - days);

    const queryOptions = {
      period1: Math.floor(startDate.getTime() / 1000),
      period2: Math.floor(endDate.getTime() / 1000),
      interval: intervalMap[validInterval],
    };

    const data = await yahooFinance.historical(stock, queryOptions);
    return {
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
        volume: item.volume,
      })),
    };
  } catch (error) {
    throw new Error(
      `Error getting quote data for ${stock}: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
};
export const getYahooFinanceQuote = async (stock: string) => {
  try {
    const data = await yahooFinance.quote(stock);
    return {
      success: true,
      type: 'yfinance',
      subtype: 'quote',
      stock,
      data,
    };
  } catch (error) {
    throw new Error(
      `yfinance quote request failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
};

export const getYahooFinanceQuoteSummary = async (
  stock: string,
  modules: string[]
) => {
  try {
    const allowedModules = [
      'assetProfile',
      'balanceSheetHistory',
      'balanceSheetHistoryQuarterly',
      'calendarEvents',
      'cashflowStatementHistory',
      'cashflowStatementHistoryQuarterly',
      'defaultKeyStatistics',
      'earnings',
      'earningsHistory',
      'earningsTrend',
      'financialData',
      'fundOwnership',
      'fundPerformance',
      'fundProfile',
      'incomeStatementHistory',
      'incomeStatementHistoryQuarterly',
      'indexTrend',
      'industryTrend',
      'insiderHolders',
      'insiderTransactions',
      'institutionOwnership',
      'majorDirectHolders',
      'majorHoldersBreakdown',
      'netSharePurchaseActivity',
      'price',
      'quoteType',
      'recommendationTrend',
      'secFilings',
      'sectorTrend',
      'summaryDetail',
      'summaryProfile',
      'upgradeDowngradeHistory',
    ] as const;
    type AllowedModule = (typeof allowedModules)[number];
    const modulesList = modules.filter((m): m is AllowedModule =>
      (allowedModules as readonly string[]).includes(m)
    );
    if (!modulesList.length) {
      throw new Error('modules parameter is required');
    }
    const data = await yahooFinance.quoteSummary(stock, {
      modules: modulesList,
    });
    return {
      success: true,
      type: 'yfinance',
      subtype: 'quoteSummary',
      stock,
      modules: modulesList,
      data,
    };
  } catch (error) {
    throw new Error(
      `yfinance quoteSummary request failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
};

export const getYahooFinanceHistorical = async (
  stock: string,
  interval: '1d' | '1wk' | '1mo' = '1d',
  days: number = 30
) => {
  try {
    const validDays = Math.min(days, 3650);
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - validDays);
    const data = await yahooFinance.historical(stock, {
      period1: Math.floor(startDate.getTime() / 1000),
      period2: Math.floor(endDate.getTime() / 1000),
      interval,
    });
    return {
      success: true,
      type: 'yfinance',
      subtype: 'historical',
      stock,
      interval,
      days: validDays,
      data,
    };
  } catch (error) {
    throw new Error(
      `yfinance historical request failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
};

export const getYahooFinanceSearch = async (
  query: string,
  count: number = 10
) => {
  try {
    const data = await yahooFinance.search(query, {
      quotesCount: Math.min(count, 50),
    });
    return {
      success: true,
      type: 'yfinance',
      subtype: 'search',
      query,
      count: Math.min(count, 50),
      data: data.quotes,
    };
  } catch (error) {
    throw new Error(
      `yfinance search request failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
};

export const getYahooFinanceInsights = async (stock: string) => {
  try {
    const data = await yahooFinance.insights(stock);
    return {
      success: true,
      type: 'yfinance',
      subtype: 'insights',
      stock,
      data,
    };
  } catch (error) {
    throw new Error(
      `yfinance insights request failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
};

export const getYahooFinanceOptions = async (stock: string, date?: string) => {
  try {
    let data;
    if (date) {
      const ts = parseInt(date, 10);
      const d = isNaN(ts) ? undefined : new Date(ts * 1000);
      data = await yahooFinance.options(stock, d ? { date: d } : undefined);
    } else {
      data = await yahooFinance.options(stock);
    }
    return {
      success: true,
      type: 'yfinance',
      subtype: 'options',
      stock,
      data,
    };
  } catch (error) {
    throw new Error(
      `yfinance options request failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
};

export const getYahooFinanceRecommendationsBySymbol = async (stock: string) => {
  try {
    const data = await yahooFinance.recommendationsBySymbol(stock);
    return {
      success: true,
      type: 'yfinance',
      subtype: 'recommendationsBySymbol',
      stock,
      data,
    };
  } catch (error) {
    throw new Error(
      `yfinance recommendationsBySymbol request failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
};

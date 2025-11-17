import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import {
  getStockQuote,
  getYahooFinanceQuote,
  getYahooFinanceQuoteSummary,
  getYahooFinanceHistorical,
  getYahooFinanceSearch,
  getYahooFinanceInsights,
  getYahooFinanceOptions,
  getYahooFinanceRecommendationsBySymbol,
} from '@/tool-helpers/yahoo-finance.helpers';

export const getStockQuoteTool = tool(
  async (input) => {
    console.log('test: getStockQuoteTool called with', input);
    const {
      stock,
      interval = '1d',
      days = 30,
    } = input as { stock: string; interval?: string; days?: number };
    try {
      const result = await getStockQuote(stock, interval, days);
      console.log(
        `✅ Retrieved ${result?.data?.length || 0} data points for ${stock}`
      );
      return JSON.stringify(result);
    } catch (error) {
      return `Error getting quote data for ${stock}: ${error instanceof Error ? error.message : 'Unknown error'}`;
    }
  },
  {
    name: 'get_stock_quote',
    description: 'Get historical price data for a specific stock.',
    schema: z.object({
      stock: z
        .string()
        .describe('Stock symbol (e.g., RELIANCE.NS, RELIANCE.BO)'),
      interval: z
        .enum(['1d', '1wk', '1mo'])
        .optional()
        .default('1d')
        .describe('Data interval'),
      days: z
        .number()
        .optional()
        .default(30)
        .describe('Number of days of historical data'),
    }),
  }
);

export const getYahooFinanceQuoteTool = tool(
  async (input) => {
    console.log('test: getYahooFinanceQuoteTool called with', input);
    const { stock } = input as { stock: string };
    try {
      const result = await getYahooFinanceQuote(stock);
      return JSON.stringify(result);
    } catch (error) {
      return `Error getting Yahoo Finance quote for ${stock}: ${error instanceof Error ? error.message : 'Unknown error'}`;
    }
  },
  {
    name: 'get_yahoo_finance_quote',
    description: 'Get quote data from Yahoo Finance for a specific stock.',
    schema: z.object({
      stock: z
        .string()
        .describe('Stock symbol (e.g., RELIANCE.NS, RELIANCE.BO)'),
    }),
  }
);

export const getYahooFinanceQuoteSummaryTool = tool(
  async (input) => {
    console.log('test: getYahooFinanceQuoteSummaryTool called with', input);
    const { stock, modules } = input as { stock: string; modules: string };
    try {
      const modulesList = modules.split(',').map((m) => m.trim());
      const result = await getYahooFinanceQuoteSummary(stock, modulesList);
      return JSON.stringify(result);
    } catch (error) {
      return `Error getting Yahoo Finance quote summary for ${stock}: ${error instanceof Error ? error.message : 'Unknown error'}`;
    }
  },
  {
    name: 'get_yahoo_finance_quote_summary',
    description:
      'Get detailed quote summary from Yahoo Finance for a specific stock.',
    schema: z.object({
      stock: z
        .string()
        .describe('Stock symbol (e.g., RELIANCE.NS, RELIANCE.BO)'),
      modules: z
        .string()
        .describe(
          'Comma-separated list of modules (e.g., "summaryDetail,price")'
        ),
    }),
  }
);

export const getYahooFinanceHistoricalTool = tool(
  async (input) => {
    console.log('test: getYahooFinanceHistoricalTool called with', input);
    const {
      stock,
      interval = '1d',
      days = 30,
    } = input as { stock: string; interval?: string; days?: number };
    try {
      const result = await getYahooFinanceHistorical(
        stock,
        interval as '1d' | '1wk' | '1mo',
        days
      );
      console.log(`✅ Retrieved historical data for ${stock}`);
      return JSON.stringify(result);
    } catch (error) {
      return `Error getting Yahoo Finance historical data for ${stock}: ${error instanceof Error ? error.message : 'Unknown error'}`;
    }
  },
  {
    name: 'get_yahoo_finance_historical',
    description:
      'Get historical price data from Yahoo Finance for a specific stock.',
    schema: z.object({
      stock: z
        .string()
        .describe('Stock symbol (e.g., RELIANCE.NS, RELIANCE.BO)'),
      interval: z
        .enum(['1d', '1wk', '1mo'])
        .optional()
        .default('1d')
        .describe('Data interval'),
      days: z
        .number()
        .optional()
        .default(30)
        .describe('Number of days of historical data'),
    }),
  }
);

export const getYahooFinanceSearchTool = tool(
  async (input) => {
    console.log('test: getYahooFinanceSearchTool called with', input);
    const { query, count = 10 } = input as { query: string; count?: number };
    try {
      const result = await getYahooFinanceSearch(query, count);
      return JSON.stringify(result);
    } catch (error) {
      return `Error searching Yahoo Finance for ${query}: ${error instanceof Error ? error.message : 'Unknown error'}`;
    }
  },
  {
    name: 'get_yahoo_finance_search',
    description: 'Search for stocks or companies on Yahoo Finance.',
    schema: z.object({
      query: z.string().describe('Search query'),
      count: z
        .number()
        .optional()
        .default(10)
        .describe('Number of results to return'),
    }),
  }
);

export const getYahooFinanceInsightsTool = tool(
  async (input) => {
    console.log('test: getYahooFinanceInsightsTool called with', input);
    const { stock } = input as { stock: string };
    try {
      const result = await getYahooFinanceInsights(stock);
      return JSON.stringify(result);
    } catch (error) {
      return `Error getting Yahoo Finance insights for ${stock}: ${error instanceof Error ? error.message : 'Unknown error'}`;
    }
  },
  {
    name: 'get_yahoo_finance_insights',
    description: 'Get insights data from Yahoo Finance for a specific stock.',
    schema: z.object({
      stock: z
        .string()
        .describe('Stock symbol (e.g., RELIANCE.NS, RELIANCE.BO)'),
    }),
  }
);

export const getYahooFinanceOptionsTool = tool(
  async (input) => {
    console.log('test: getYahooFinanceOptionsTool called with', input);
    const { stock, date } = input as { stock: string; date?: string };
    try {
      const result = await getYahooFinanceOptions(stock, date);
      return JSON.stringify(result);
    } catch (error) {
      return `Error getting Yahoo Finance options for ${stock}: ${error instanceof Error ? error.message : 'Unknown error'}`;
    }
  },
  {
    name: 'get_yahoo_finance_options',
    description: 'Get options data from Yahoo Finance for a specific stock.',
    schema: z.object({
      stock: z
        .string()
        .describe('Stock symbol (e.g., RELIANCE.NS, RELIANCE.BO)'),
      date: z.string().optional().describe('Expiration date timestamp'),
    }),
  }
);

export const getYahooFinanceRecommendationsBySymbolTool = tool(
  async (input) => {
    console.log(
      'test: getYahooFinanceRecommendationsBySymbolTool called with',
      input
    );
    const { stock } = input as { stock: string };
    try {
      const result = await getYahooFinanceRecommendationsBySymbol(stock);
      return JSON.stringify(result);
    } catch (error) {
      return `Error getting Yahoo Finance recommendations for ${stock}: ${error instanceof Error ? error.message : 'Unknown error'}`;
    }
  },
  {
    name: 'get_yahoo_finance_recommendations_by_symbol',
    description:
      'Get analyst recommendations from Yahoo Finance for a specific stock.',
    schema: z.object({
      stock: z
        .string()
        .describe('Stock symbol (e.g., RELIANCE.NS, RELIANCE.BO)'),
    }),
  }
);

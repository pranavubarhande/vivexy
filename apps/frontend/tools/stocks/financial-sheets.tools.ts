import { getFinancialSheets } from '@/tool-helpers/financial-sheets.helpers';
import { tool } from '@langchain/core/tools';
import { z } from 'zod';

export const getFinancialSheetsTool = tool(
  async (input) => {
    console.log('test: getFinancialSheetsTool called with', input);
    const { stock, subtype } = input as { stock: string; subtype: string };
    try {
      const result = await getFinancialSheets(stock, subtype);
      return JSON.stringify(result);
    } catch (error) {
      return `Error getting financial sheets for ${stock}: ${error instanceof Error ? error.message : 'Unknown error'}`;
    }
  },
  {
    name: 'get_financial_sheets',
    description:
      'Get specific financial statements (balance sheet, income statement, cash flow) for a stock.',
    schema: z.object({
      stock: z
        .string()
        .describe(
          'Stock symbol (e.g., RELIANCE, TCS, TMCV). Use get_yahoo_finance_search for finding stock symbol. Dont include "BO" or "NS" at the end of the stock symbol here.'
        ),
      subtype: z
        .enum([
          'balance_sheet',
          'profit_loss',
          'cash_flow',
          'quarterly_results',
          'ratios',
          'shareholding_pattern',
        ])
        .describe('Type of financial sheet to retrieve'),
    }),
  }
);

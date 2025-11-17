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
      stock: z.string().describe('Stock symbol (e.g., RELIANCE, TCS)'),
      subtype: z
        .enum(['balancesheet', 'incomestatement', 'cashflow'])
        .describe('Type of financial sheet to retrieve'),
    }),
  }
);

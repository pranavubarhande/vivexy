import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { getStockNews } from '@/tool-helpers/news.helpers';

export const getStockNewsTool = tool(
  async (input) => {
    console.log('test: getStockNewsTool called with', input);
    const { stock, count = 10 } = input as { stock: string; count?: number };
    try {
      const result = await getStockNews(stock, count);
      console.log(
        `✅ Retrieved ${result?.data?.length || 0} news articles for ${stock}`
      );
      return JSON.stringify(result);
    } catch (error) {
      return `Error getting news for ${stock}: ${error instanceof Error ? error.message : 'Unknown error'}`;
    }
  },
  {
    name: 'get_stock_news',
    description: 'Get recent news articles for a specific stock.',
    schema: z.object({
      stock: z.string().describe('Stock symbol (e.g., RELIANCE, TCS)'),
      count: z
        .number()
        .optional()
        .default(10)
        .describe('Number of news articles to retrieve'),
    }),
  }
);

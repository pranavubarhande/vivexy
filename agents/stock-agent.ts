import { ChatOpenAI } from '@langchain/openai';
import { ChatAnthropic } from '@langchain/anthropic';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { getStockNewsTool } from '@/tools/stocks/news.tools';
import {
  getStockQuoteTool,
  getYahooFinanceQuoteTool,
  getYahooFinanceQuoteSummaryTool,
  getYahooFinanceHistoricalTool,
  getYahooFinanceSearchTool,
  getYahooFinanceInsightsTool,
  getYahooFinanceOptionsTool,
  getYahooFinanceRecommendationsBySymbolTool,
} from '@/tools/stocks/yahoo-finance.tools';
import { getFinancialSheetsTool } from '@/tools/stocks/financial-sheets.tools';
import { DynamicStructuredTool } from '@langchain/core/tools';

export interface AgentResponse {
  content: string;
  reasoning: Array<{
    thought: string;
    toolCalls?: Array<{
      tool: string;
      input: Record<string, unknown>;
      output: string;
    }>;
  }>;
}

export class StockAnalysisAgent {
  private agent: ReturnType<typeof createReactAgent>;
  private llm: ChatOpenAI | ChatAnthropic | ChatGoogleGenerativeAI;
  private provider: string;
  private modelId: string;
  private stockAnalysisTools: DynamicStructuredTool[];

  constructor(provider: string, modelId: string) {
    this.provider = provider;
    this.modelId = modelId;

    this.stockAnalysisTools = [
      getStockNewsTool,
      getFinancialSheetsTool,
      getYahooFinanceQuoteTool,
      getYahooFinanceQuoteSummaryTool,
      getYahooFinanceHistoricalTool,
      getYahooFinanceSearchTool,
      getYahooFinanceInsightsTool,
      getYahooFinanceOptionsTool,
      getYahooFinanceRecommendationsBySymbolTool,
      getStockQuoteTool,
    ];

    // Create the LLM based on provider
    switch (provider) {
      case 'openai':
        this.llm = new ChatOpenAI({
          model: modelId,
          temperature: 0.1, // Lower temperature for more consistent analysis
          openAIApiKey: process.env.OPENAI_API_KEY,
        });
        break;
      case 'anthropic':
        this.llm = new ChatAnthropic({
          model: modelId,
          temperature: 0.1,
          anthropicApiKey: process.env.ANTHROPIC_API_KEY,
        });
        break;
      case 'google':
        this.llm = new ChatGoogleGenerativeAI({
          model: modelId,
          temperature: 0.1,
          apiKey: process.env.GOOGLE_AI_API_KEY,
        });
        break;
      default:
        throw new Error(`Unsupported provider: ${provider}`);
    }

    // Create the agent with tools
    this.agent = createReactAgent({
      llm: this.llm,
      tools: this.stockAnalysisTools,
      messageModifier: `You are a professional stock analysis assistant. You have access to various financial data sources and tools to help users with stock analysis, research, and investment decisions.

Your capabilities include:
- Searching for stocks by symbol or company name in yahoo finance
- Getting fundamental data (company overview, financial metrics). Make sure to remove .NS or .BSE from the stock name if there. For example, for RELIANCE.NS or RELIANCE.BSE or RELIANCE.NSE, use RELIANCE
- Retrieving recent news articles for stocks. Make sure to remove .NS or .BSE from the stock name if there. For example, for RELIANCE.NS or RELIANCE.BSE or RELIANCE.NSE, use RELIANCE
- Fetching historical price data and quotes. Use direct symbol from stock search tool. Don't remove anything.
- Getting quote data from Yahoo Finance. Use direct symbol from stock search tool. Don't remove anything.
- Getting detailed quote summary from Yahoo Finance. Use direct symbol from stock search tool. Don't remove anything.
- Getting historical data from Yahoo Finance. Use direct symbol from stock search tool. Don't remove anything.
- Searching stocks on Yahoo Finance.
- Getting insights from Yahoo Finance. Use direct symbol from stock search tool. Don't remove anything.
- Getting options data from Yahoo Finance. Use direct symbol from stock search tool. Don't remove anything.
- Getting analyst recommendations from Yahoo Finance. Use direct symbol from stock search tool. Don't remove anything.
- Getting specific financial statements (balance sheet, income statement, cash flow). Make sure to remove .NS or .BSE from the stock name if there. For example, for RELIANCE.NS or RELIANCE.BSE or RELIANCE.NSE, use RELIANCE.

When analyzing stocks or answering questions:
1. Create a step by step plan to answer the question and use tools to gather relevant data
2. Always use the available tools to gather relevant data
3. Provide comprehensive analysis based on the data you collect
4. Explain your reasoning clearly
5. Use multiple data sources when appropriate for a complete picture
6. Use history of user messages correctly so that user won't have to enter same information again and again.
7. If user has given a stock name in the message or chat history, use it to get stock name using search tool instead of asking the user again.

Always gather data first before providing analysis, and be thorough in your research.`,
    });
  }

  async analyze(message: string): Promise<AgentResponse> {
    return this.analyzeWithHistory([
      {
        role: 'user',
        content: message,
      },
    ]);
  }

  async analyzeWithHistory(
    messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>
  ): Promise<AgentResponse> {
    console.log('test: messages', messages);
    try {
      const reasoning: AgentResponse['reasoning'] = [];

      const result = await this.agent.invoke(
        {
          messages,
        }
        // {
        //   recursionLimit: 9, // Limit tool calls to 8
        // },
      );

      const finalMessage = result.messages[result.messages.length - 1];
      const content = finalMessage.content as string;

      return {
        content,
        reasoning,
      };
    } catch (error) {
      console.error('\n❌ ===== TEST FAILED =====');
      console.error('Error details:', error);
      throw new Error(
        `Analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }
}

export const createStockAnalysisAgent = (
  provider: string,
  modelId: string
): StockAnalysisAgent => {
  return new StockAnalysisAgent(provider, modelId);
};

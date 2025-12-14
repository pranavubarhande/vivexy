import { ChatOpenAI } from '@langchain/openai';
import { ChatAnthropic } from '@langchain/anthropic';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { ChatXAI } from '@langchain/xai';
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import {
  HumanMessage,
  AIMessage,
  SystemMessage,
} from '@langchain/core/messages';
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
import { getArtifactCreationTool } from '@/tools/artifacts/artifact-creation.tools';
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

export type StreamEvent =
  | { type: 'start' }
  | { type: 'reasoning'; data: AgentResponse['reasoning'][0] }
  | { type: 'content'; data: string }
  | { type: 'done'; data: AgentResponse };

export class StockAnalysisAgent {
  private agent: ReturnType<typeof createReactAgent>;
  private llm: ChatOpenAI | ChatAnthropic | ChatGoogleGenerativeAI | ChatXAI;
  private provider: string;
  private modelId: string;
  private chatId: string;
  private stockAnalysisTools: DynamicStructuredTool[];

  constructor(provider: string, modelId: string, chatId: string) {
    this.provider = provider;
    this.modelId = modelId;
    this.chatId = chatId;

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
      getArtifactCreationTool(this.chatId),
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
          verbose: true,
        });
        break;
      case 'grok':
        this.llm = new ChatXAI({
          model: modelId,
          temperature: 0.1,
          apiKey: process.env.GROK_API_KEY,
        });
        break;
      default:
        throw new Error(`Unsupported provider: ${provider}`);
    }

    // Create the agent with tools
    this.agent = createReactAgent({
      llm: this.llm,
      tools: this.stockAnalysisTools,
      messageModifier: `You are a stock analysis assistant. Use all available tools to answer questions and generate artifacts when appropriate.`,
    });
  }

  async *streamAnalysis(
    messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>
  ) {
    console.log('Streaming analysis for messages:', messages);
    try {
      const langchainMessages = messages.map((m) => {
        switch (m.role) {
          case 'user':
            return new HumanMessage(m.content);
          case 'assistant':
            return new AIMessage(m.content);
          case 'system':
            return new SystemMessage(m.content);
          default:
            throw new Error(`Unsupported role: ${m.role}`);
        }
      });

      console.log(
        'Sending messages to LLM:',
        langchainMessages.map((m) => ({
          role: m._getType(),
          content: m.content,
        }))
      );

      // Start event streaming with v1 config
      const stream = await this.agent.streamEvents(
        { messages: langchainMessages },
        { version: 'v1' }
      );

      for await (const event of stream) {
        console.log('Raw event from stream:', event);
        yield event;
      }
    } catch (error) {
      console.error('\n❌ ===== STREAMING FAILED =====');
      console.error('Error details:', error);
      throw new Error(
        `Streaming failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async *analyzeWithHistory(
    messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>
  ): AsyncIterable<StreamEvent> {
    console.log('Streaming analysis for messages:', messages);
    try {
      yield { type: 'start' };

      const stream = this.streamAnalysis(messages);
      let content = '';
      const reasoning: AgentResponse['reasoning'] = [];
      const currentToolCalls: Array<{
        tool: string;
        input: Record<string, unknown>;
        output: string;
      }> = [];

      for await (const event of stream) {
        if (event.event === 'on_llm_stream') {
          // Accumulate token content
          const chunk = event.data.chunk;
          if (chunk.content) {
            content += chunk.content;
            yield { type: 'content', data: chunk.content };
          }
        }

        if (event.event === 'on_agent_action') {
          // Tool call started
          currentToolCalls.push({
            tool: event.name,
            input: event.data.input,
            output: '',
          });
          reasoning.push({
            thought: `Using ${event.name} tool`,
            toolCalls: [currentToolCalls[currentToolCalls.length - 1]],
          });
          yield { type: 'reasoning', data: reasoning[reasoning.length - 1] };
        }

        if (event.event === 'on_tool_result') {
          // Tool call completed
          const lastToolCall = currentToolCalls[currentToolCalls.length - 1];
          if (lastToolCall) {
            lastToolCall.output = JSON.stringify(event.data.output);
          }
        }

        if (event.event === 'on_agent_finish') {
          // Agent completed
          yield { type: 'done', data: { content, reasoning } };
        }
      }
    } catch (error) {
      console.error('\n❌ ===== STREAMING FAILED =====');
      console.error('Error details:', error);
      throw new Error(
        `Streaming failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }
}

export const createStockAnalysisAgent = (
  provider: string,
  modelId: string,
  chatId: string
): StockAnalysisAgent => {
  return new StockAnalysisAgent(provider, modelId, chatId);
};

// Test execution
async function runTest() {
  const agent = createStockAnalysisAgent(
    'google',
    'gemini-2.5-flash',
    'test-chat-id'
  );

  const messages = [
    {
      role: 'user' as const,
      content: 'What is the current stock price of AAPL?',
    },
  ];

  console.log('Starting test stream...\n');

  for await (const event of agent.analyzeWithHistory(messages)) {
    console.log('Event:', event);
  }

  console.log('\nTest completed.');
}

// Run the test if this file is executed directly
if (require.main === module) {
  runTest().catch(console.error);
}

import { ChatOpenAI } from '@langchain/openai';
import { ChatAnthropic } from '@langchain/anthropic';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import {
  HumanMessage,
  AIMessage,
  SystemMessage,
  BaseMessage,
} from '@langchain/core/messages';

export interface LLMMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface LLMResponse {
  content: string;
  model: string;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
}

// LangChain-based LLM Service
export class LangChainLLMService {
  private config: {
    openaiApiKey?: string;
    claudeApiKey?: string;
    geminiApiKey?: string;
  };

  constructor(config: {
    openaiApiKey?: string;
    claudeApiKey?: string;
    geminiApiKey?: string;
  }) {
    this.config = config;
  }

  private convertToLangChainMessages(messages: LLMMessage[]): BaseMessage[] {
    return messages.map((msg) => {
      switch (msg.role) {
        case 'user':
          return new HumanMessage(msg.content);
        case 'assistant':
          return new AIMessage(msg.content);
        case 'system':
          return new SystemMessage(msg.content);
        default:
          throw new Error(`Unsupported message role: ${msg.role}`);
      }
    });
  }

  async generateResponse(
    messages: LLMMessage[],
    provider: string,
    modelId: string
  ): Promise<LLMResponse> {
    if (!this.hasProvider(provider)) {
      throw new Error(`${provider} API key not configured`);
    }

    try {
      let model: BaseChatModel;

      if (provider === 'openai' && this.config.openaiApiKey) {
        model = new ChatOpenAI({
          openAIApiKey: this.config.openaiApiKey,
          model: modelId,
          temperature: 0.7,
          maxTokens: 2000,
        });
      } else if (provider === 'anthropic' && this.config.claudeApiKey) {
        model = new ChatAnthropic({
          anthropicApiKey: this.config.claudeApiKey,
          model: modelId,
          temperature: 0.7,
          maxTokens: 2000,
        });
      } else if (provider === 'google' && this.config.geminiApiKey) {
        model = new ChatGoogleGenerativeAI({
          apiKey: this.config.geminiApiKey,
          model: modelId,
          temperature: 0.7,
          maxOutputTokens: 2000,
        });
      } else {
        throw new Error(`Unsupported provider: ${provider}`);
      }

      // Add delay before LLM call to respect rate limits
      await new Promise((resolve) => setTimeout(resolve, 2000));

      const langChainMessages = this.convertToLangChainMessages(messages);
      const response = await model.invoke(langChainMessages);
      const content = response.content as string;

      // Extract usage information if available
      const responseMetadata = response.response_metadata || {};
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const usage: any = responseMetadata.usage || responseMetadata.tokenUsage;

      return {
        content,
        model: modelId,
        usage: usage
          ? {
              promptTokens:
                usage.promptTokens || usage.prompt_tokens || usage.input_tokens,
              completionTokens:
                usage.completionTokens ||
                usage.completion_tokens ||
                usage.output_tokens,
              totalTokens:
                usage.totalTokens ||
                usage.total_tokens ||
                (usage.input_tokens || 0) + (usage.output_tokens || 0),
            }
          : undefined,
      };
    } catch (error) {
      throw new Error(
        `${provider} API error: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  // Method to get available providers
  getAvailableProviders(): string[] {
    const providers: string[] = [];
    if (this.config.openaiApiKey) providers.push('openai');
    if (this.config.claudeApiKey) providers.push('anthropic');
    if (this.config.geminiApiKey) providers.push('google');
    return providers;
  }

  // Method to check if a provider is available
  hasProvider(provider: string): boolean {
    switch (provider) {
      case 'openai':
        return !!this.config.openaiApiKey;
      case 'anthropic':
        return !!this.config.claudeApiKey;
      case 'google':
        return !!this.config.geminiApiKey;
      default:
        return false;
    }
  }
}

// Factory function to create LLM service from environment variables
export const createLLMService = (): LangChainLLMService => {
  return new LangChainLLMService({
    openaiApiKey: process.env.OPENAI_API_KEY,
    claudeApiKey: process.env.ANTHROPIC_API_KEY,
    geminiApiKey: process.env.GOOGLE_AI_API_KEY,
  });
};

// Backward compatibility alias
export const LLMService = LangChainLLMService;

import { withAuth } from '@/middlewares/auth';
import { NextRequest, NextResponse } from 'next/server';
import {
  getChatMessages,
  createMessage,
  updateMessage,
} from '@/business-logic/chat';
import { prisma } from '@/lib/prisma';
import { createStockAnalysisAgent } from '@/agents/stock-agent';
import { createLLMService } from '@/business-logic/llm-integration';

export const dynamic = 'force-dynamic';

export const GET = withAuth(async (request: NextRequest, user, { params }) => {
  try {
    const { chatId } = await params;
    const messages = await getChatMessages(chatId, user.id);
    return NextResponse.json(messages);
  } catch (error) {
    console.error('Error fetching messages:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 }
    );
  }
});

export const PUT = withAuth(async (request: NextRequest, user) => {
  try {
    const body = await request.json();
    const { messageId, content, modelId } = body;

    if (!messageId || !content || typeof content !== 'string') {
      return NextResponse.json(
        { error: 'Message ID and content are required' },
        { status: 400 }
      );
    }

    const updatedMessage = await updateMessage(
      messageId,
      content.trim(),
      user.id,
      modelId
    );
    return NextResponse.json(updatedMessage);
  } catch (error) {
    console.error('Error updating message:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 }
    );
  }
});

// @ts-expect-error - withAuth wrapper has complex typing with Response vs NextResponse
export const POST = withAuth(async (request: NextRequest, user, { params }) => {
  try {
    const { chatId } = await params;
    const body = await request.json();
    const { role, content, modelId, stream } = body;

    if (!role || !['USER', 'ASSISTANT', 'SYSTEM'].includes(role)) {
      return NextResponse.json(
        { error: 'Valid role is required (USER, ASSISTANT, SYSTEM)' },
        { status: 400 }
      );
    }

    if (!content || typeof content !== 'string') {
      return NextResponse.json(
        { error: 'Content is required' },
        { status: 400 }
      );
    }

    // If streaming is requested, return streaming response
    if (stream && role === 'USER' && modelId) {
      const model = await prisma.lLMModel.findUnique({
        where: { id: modelId },
      });

      if (!model) {
        return NextResponse.json({ error: 'Model not found' }, { status: 400 });
      }

      // Verify the chat exists and belongs to the user
      const chat = await prisma.chat.findFirst({
        where: {
          id: chatId,
          userId: user.id,
        },
      });

      if (!chat) {
        return NextResponse.json({ error: 'Chat not found' }, { status: 404 });
      }

      // Update chat's updatedAt timestamp and lastModelId
      await prisma.chat.update({
        where: {
          id: chatId,
          userId: user.id,
        },
        data: {
          updatedAt: new Date(),
          ...(modelId && { lastModelId: modelId }),
        },
      });

      // Create the user message first
      const userMessage = await prisma.message.create({
        data: {
          chatId,
          role,
          content: content.trim(),
          modelId,
        },
        include: {
          model: true,
        },
      });

      // Get the full conversation history including the new user message
      const conversationMessages = await prisma.message.findMany({
        where: { chatId },
        orderBy: { createdAt: 'asc' },
        include: { model: true },
      });

      // Convert to LLM format
      const llmMessages = conversationMessages.map((msg) => ({
        role: msg.role.toLowerCase() as 'user' | 'assistant' | 'system',
        content: msg.content,
      }));

      // Create agent and start streaming
      const agent = createStockAnalysisAgent(
        model.provider,
        model.modelId,
        chatId
      );
      const streamGenerator = agent.streamAnalysis(llmMessages);

      // Create clean SSE response
      const encoder = new TextEncoder();
      let isStreamEnded = false;

      const readable = new ReadableStream({
        async start(controller) {
          try {
            // Send user message immediately
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ type: 'user_message', data: userMessage })}\n\n`
              )
            );

            let accumulatedContent = '';
            const reasoning: Array<{
              thought: string;
              toolCalls: Array<{
                tool: string;
                input: Record<string, unknown>;
                output: string;
              }>;
            }> = [];

            let hasFinished = false;
            for await (const event of streamGenerator) {
              if (isStreamEnded) break;

              if (event.event === 'on_llm_stream') {
                const chunk = event.data.chunk;
                if (chunk.content) {
                  accumulatedContent += chunk.content;
                  controller.enqueue(
                    encoder.encode(
                      `data: ${JSON.stringify({
                        type: 'content',
                        data: chunk.content,
                      })}\n\n`
                    )
                  );
                }
              }

              if (event.event === 'on_agent_action') {
                reasoning.push({
                  thought: `Using ${event.name} tool`,
                  toolCalls: [
                    {
                      tool: event.name,
                      input: event.data.input,
                      output: '',
                    },
                  ],
                });
                controller.enqueue(
                  encoder.encode(
                    `data: ${JSON.stringify({
                      type: 'reasoning',
                      data: reasoning[reasoning.length - 1],
                    })}\n\n`
                  )
                );
              }

              if (event.event === 'on_tool_result') {
                const lastReasoning = reasoning[reasoning.length - 1];
                if (lastReasoning && lastReasoning.toolCalls.length > 0) {
                  lastReasoning.toolCalls[
                    lastReasoning.toolCalls.length - 1
                  ].output = JSON.stringify(event.data.output);
                }
              }

              if (event.event === 'on_agent_finish') {
                console.log('Agent finished, creating assistant message');
                hasFinished = true;
                break;
              }
            }

            // Always create the assistant message after streaming ends
            console.log(
              'Creating assistant message after streaming, content length:',
              accumulatedContent.length
            );
            const assistantMessage = await prisma.message.create({
              data: {
                chatId,
                role: 'ASSISTANT',
                content: accumulatedContent,
                modelId,
                reasoning: JSON.parse(JSON.stringify(reasoning)),
              },
              include: {
                model: true,
              },
            });

            console.log('Assistant message created:', assistantMessage.id);

            // Update chat timestamp
            await prisma.chat.update({
              where: {
                id: chatId,
                userId: user.id,
              },
              data: { updatedAt: new Date() },
            });

            // Check if any artifacts were created during this response
            // This will be picked up by the frontend query invalidation

            // Generate chat title if this is the first conversation (user + assistant messages)
            const messageCount = await prisma.message.count({
              where: { chatId },
            });

            if (messageCount === 2) {
              // Get the user message content for title generation
              const userMessage = await prisma.message.findFirst({
                where: {
                  chatId,
                  role: 'USER',
                },
                orderBy: { createdAt: 'desc' },
              });

              if (userMessage) {
                try {
                  // Generate title using Gemini
                  const geminiModel = await prisma.lLMModel.findFirst({
                    where: {
                      provider: 'google',
                      modelId: 'gemini-2.5-flash',
                      isActive: true,
                    },
                  });

                  if (geminiModel) {
                    const titlePrompt = `Based on this conversation, generate a very short, concise title (max 6 words) that summarizes what this chat is about. Just return the title, nothing else.\n\nUser: ${userMessage.content}\n\nAssistant: ${accumulatedContent}`;

                    // Add delay before title generation to respect rate limits
                    await new Promise((resolve) => setTimeout(resolve, 3000));

                    console.log(`[Chat] Generating title for conversation`);
                    const llmService = createLLMService();
                    const titleResponse = await llmService.generateResponse(
                      [{ role: 'user', content: titlePrompt }],
                      geminiModel.provider,
                      geminiModel.modelId
                    );

                    const generatedTitle = titleResponse.content
                      .trim()
                      .replace(/^["']|["']$/g, '')
                      .substring(0, 50);

                    if (generatedTitle && generatedTitle !== 'New Chat') {
                      await prisma.chat.update({
                        where: {
                          id: chatId,
                          userId: user.id,
                        },
                        data: { title: generatedTitle },
                      });
                      console.log(`[Chat] Generated title: ${generatedTitle}`);
                    }
                  }
                } catch (error) {
                  console.error('Error generating chat title:', error);
                  // Don't fail the request if title generation fails
                }
              }
            }

            console.log('Sending assistant_message event');
            // Send final message
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  type: 'assistant_message',
                  data: assistantMessage,
                })}\n\n`
              )
            );

            console.log('Closing controller');
            controller.close();
          } catch (error) {
            console.error('Streaming error:', error);
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  type: 'error',
                  message:
                    error instanceof Error ? error.message : 'Streaming failed',
                })}\n\n`
              )
            );
            controller.close();
          }
        },
        cancel() {
          isStreamEnded = true;
        },
      });

      return new Response(readable, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        },
      });
    }

    // Regular non-streaming message creation
    const message = await createMessage(
      chatId,
      {
        role,
        content: content.trim(),
        modelId,
      },
      user.id
    );

    return NextResponse.json(message, { status: 201 });
  } catch (error) {
    console.error('Error creating message:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 }
    );
  }
});

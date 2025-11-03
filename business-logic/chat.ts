import { prisma } from '@/lib/prisma';
import { MessageRole } from '@prisma/client';
import { createLLMService } from './llm-integration';

export interface CreateChatData {
  title?: string;
}

export interface CreateMessageData {
  role: MessageRole;
  content: string;
  modelId?: string;
}

export const getUserChats = async (userId: string) => {
  return await prisma.chat.findMany({
    where: {
      userId,
    },
    orderBy: {
      updatedAt: 'desc',
    },
    include: {
      messages: {
        orderBy: {
          createdAt: 'asc',
        },
        take: 1, // Get the first message for preview
      },
    },
  });
};

export const getUserChat = async (chatId: string, userId: string) => {
  const chat = await prisma.chat.findFirst({
    where: {
      id: chatId,
      userId,
    },
    include: {
      messages: {
        orderBy: {
          createdAt: 'asc',
        },
      },
    },
  });

  if (!chat) {
    throw new Error('Chat not found');
  }

  return chat;
};

export const createChat = async (data: CreateChatData, userId: string) => {
  return await prisma.chat.create({
    data: {
      userId,
      title: data.title || 'New Chat',
    },
  });
};

export const updateChatTitle = async (
  chatId: string,
  title: string,
  userId: string
) => {
  const updatedChat = await prisma.chat.updateMany({
    where: {
      id: chatId,
      userId,
    },
    data: {
      title,
      updatedAt: new Date(),
    },
  });

  if (updatedChat.count === 0) {
    throw new Error('Chat not found');
  }

  return await prisma.chat.findUnique({
    where: { id: chatId },
  });
};

export const deleteChat = async (chatId: string, userId: string) => {
  // Messages will be deleted automatically due to cascade
  const deletedChat = await prisma.chat.deleteMany({
    where: {
      id: chatId,
      userId,
    },
  });

  if (deletedChat.count === 0) {
    throw new Error('Chat not found');
  }

  return deletedChat;
};

export const getChatMessages = async (chatId: string, userId: string) => {
  // First verify the chat belongs to the user
  const chat = await prisma.chat.findFirst({
    where: {
      id: chatId,
      userId,
    },
  });

  if (!chat) {
    throw new Error('Chat not found');
  }

  return await prisma.message.findMany({
    where: {
      chatId,
    },
    orderBy: {
      createdAt: 'asc',
    },
    include: {
      model: true,
    },
  });
};

export const createMessage = async (
  chatId: string,
  data: CreateMessageData,
  userId: string
) => {
  // Verify the chat belongs to the user
  const chat = await prisma.chat.findFirst({
    where: {
      id: chatId,
      userId,
    },
  });

  if (!chat) {
    throw new Error('Chat not found');
  }

  // Update chat's updatedAt timestamp and lastModelId
  await prisma.chat.update({
    where: {
      id: chatId,
      userId,
    },
    data: {
      updatedAt: new Date(),
      ...(data.modelId && { lastModelId: data.modelId }),
    },
  });

  // If this is a user message and we have a model, generate AI response first
  if (data.role === 'USER' && data.modelId) {
    const model = await prisma.lLMModel.findUnique({
      where: { id: data.modelId },
    });

    if (!model) {
      throw new Error('Model not found');
    }

    try {
      // Get conversation history for context (excluding the new message)
      const conversationMessages = await prisma.message.findMany({
        where: { chatId },
        orderBy: { createdAt: 'asc' },
        include: { model: true },
      });

      // Convert to LLM format and add the new user message
      const llmMessages = [
        ...conversationMessages.map((msg) => ({
          role: msg.role.toLowerCase() as 'user' | 'assistant' | 'system',
          content: msg.content,
        })),
        {
          role: 'user' as const,
          content: data.content,
        },
      ];

      // Generate AI response
      const llmService = createLLMService();
      const aiResponse = await llmService.generateResponse(
        llmMessages,
        model.provider,
        model.modelId
      );

      // Create user message
      const userMessage = await prisma.message.create({
        data: {
          chatId,
          role: data.role,
          content: data.content,
          modelId: data.modelId,
        },
        include: {
          model: true,
        },
      });

      // Create AI response message
      const aiMessage = await prisma.message.create({
        data: {
          chatId,
          role: 'ASSISTANT',
          content: aiResponse.content,
          modelId: data.modelId,
        },
        include: {
          model: true,
        },
      });

      // Update chat timestamp
      await prisma.chat.update({
        where: {
          id: chatId,
          userId,
        },
        data: { updatedAt: new Date() },
      });

      // Generate chat title if this is the first user message
      const messageCount = await prisma.message.count({
        where: { chatId },
      });

      if (messageCount === 2) {
        // User message + AI response just created
        try {
          // Use Gemini for title generation
          const geminiModel = await prisma.lLMModel.findFirst({
            where: {
              provider: 'google',
              modelId: 'gemini-2.0-flash-exp',
              isActive: true,
            },
          });

          if (geminiModel) {
            const titlePrompt = `Based on this conversation, generate a very short, concise title (max 6 words) that summarizes what this chat is about. Just return the title, nothing else.\n\nUser: ${data.content}\n\nAssistant: ${aiResponse.content}`;

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
                  userId,
                },
                data: { title: generatedTitle },
              });
            }
          }
        } catch (error) {
          console.error('Error generating chat title:', error);
          // Don't throw - title generation is optional
        }
      }

      return aiMessage;
    } catch (error) {
      console.error('Error generating AI response:', error);
      // Throw error without creating any messages
      throw error;
    }
  }

  // For non-user messages or when no model is specified, just create the message
  return await prisma.message.create({
    data: {
      chatId,
      role: data.role,
      content: data.content,
      modelId: data.modelId,
    },
    include: {
      model: true,
    },
  });
};

export const updateMessage = async (
  messageId: string,
  content: string,
  userId: string,
  modelId?: string
) => {
  // First verify the message belongs to the user
  const message = await prisma.message.findFirst({
    where: {
      id: messageId,
    },
    include: {
      chat: true,
    },
  });

  if (!message || message.chat.userId !== userId) {
    throw new Error('Message not found');
  }

  // Update the message content and optionally modelId
  const updateData: { content: string; modelId?: string } = { content };
  if (modelId) {
    updateData.modelId = modelId;
  }

  const updatedMessage = await prisma.message.update({
    where: { id: messageId },
    data: updateData,
    include: { model: true },
  });

  // Delete all messages after this one in the conversation
  await prisma.message.deleteMany({
    where: {
      chatId: message.chatId,
      createdAt: {
        gt: message.createdAt,
      },
    },
  });

  // Update chat's updatedAt timestamp
  await prisma.chat.update({
    where: {
      id: message.chatId,
      userId,
    },
    data: { updatedAt: new Date() },
  });

  // Generate new AI response if this was a user message and had a model
  if (message.role === 'USER' && message.modelId) {
    // Get the updated conversation history
    const conversationMessages = await prisma.message.findMany({
      where: { chatId: message.chatId },
      orderBy: { createdAt: 'asc' },
      include: { model: true },
    });

    // Convert to LLM format
    const llmMessages = conversationMessages.map((msg) => ({
      role: msg.role.toLowerCase() as 'user' | 'assistant' | 'system',
      content: msg.content,
    }));

    try {
      // Generate AI response
      const llmService = createLLMService();
      const model = await prisma.lLMModel.findUnique({
        where: { id: message.modelId },
      });

      if (model) {
        const aiResponse = await llmService.generateResponse(
          llmMessages,
          model.provider,
          model.modelId
        );

        // Create AI response message
        await prisma.message.create({
          data: {
            chatId: message.chatId,
            role: 'ASSISTANT',
            content: aiResponse.content,
            modelId: message.modelId,
          },
        });

        // Update chat timestamp again
        await prisma.chat.update({
          where: {
            id: message.chatId,
            userId,
          },
          data: { updatedAt: new Date() },
        });

        // Generate chat title if this is the first user message
        const messageCount = await prisma.message.count({
          where: { chatId: message.chatId },
        });

        if (messageCount === 2) {
          // User message + AI response just created
          try {
            // Use Gemini for title generation
            const geminiModel = await prisma.lLMModel.findFirst({
              where: {
                provider: 'google',
                modelId: 'gemini-2.0-flash-exp',
                isActive: true,
              },
            });

            if (geminiModel) {
              const titlePrompt = `Based on this conversation, generate a very short, concise title (max 6 words) that summarizes what this chat is about. Just return the title, nothing else.\n\nUser: ${updatedMessage.content}\n\nAssistant: ${aiResponse.content}`;

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
                    id: message.chatId,
                    userId,
                  },
                  data: { title: generatedTitle },
                });
              }
            }
          } catch (error) {
            console.error('Error generating chat title:', error);
            // Don't throw - title generation is optional
          }
        }
      }
    } catch (error) {
      console.error('Error generating AI response after message edit:', error);
      // Don't throw error - message was updated successfully, AI generation failed silently
    }
  }

  return updatedMessage;
};

export const getLLMModels = async () => {
  return await prisma.lLMModel.findMany({
    where: {
      isActive: true,
    },
    orderBy: {
      name: 'asc',
    },
  });
};

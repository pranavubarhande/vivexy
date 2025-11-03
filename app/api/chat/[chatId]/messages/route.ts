import { withAuth } from '@/middlewares/auth';
import { NextRequest, NextResponse } from 'next/server';
import {
  getChatMessages,
  createMessage,
  updateMessage,
} from '@/business-logic/chat';
import { prisma } from '@/lib/prisma';

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

export const POST = withAuth(async (request: NextRequest, user, { params }) => {
  try {
    const { chatId } = await params;
    const body = await request.json();
    const { role, content, modelId } = body;

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

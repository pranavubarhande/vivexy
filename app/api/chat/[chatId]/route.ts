import { withAuth } from '@/middlewares/auth';
import { NextRequest, NextResponse } from 'next/server';
import { getUserChat, updateChatTitle, deleteChat } from '@/business-logic/chat';

export const GET = withAuth(async (request: NextRequest, user, { params }) => {
  try {
    const { chatId } = await params;
    const chat = await getUserChat(chatId, user.id);
    return NextResponse.json(chat);
  } catch (error) {
    console.error('Error fetching chat:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 }
    );
  }
});

export const PATCH = withAuth(async (request: NextRequest, user, { params }) => {
  try {
    const { chatId } = await params;
    const body = await request.json();
    const { title } = body;

    if (!title || typeof title !== 'string') {
      return NextResponse.json(
        { error: 'Title is required' },
        { status: 400 }
      );
    }

    const chat = await updateChatTitle(chatId, title.trim(), user.id);
    return NextResponse.json(chat);
  } catch (error) {
    console.error('Error updating chat:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 }
    );
  }
});

export const DELETE = withAuth(async (request: NextRequest, user, { params }) => {
  try {
    const { chatId } = await params;
    await deleteChat(chatId, user.id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting chat:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 }
    );
  }
});
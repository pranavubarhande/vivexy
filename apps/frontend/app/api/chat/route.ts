import { withAuth } from '@/middlewares/auth';
import { NextRequest, NextResponse } from 'next/server';
import { getUserChats, createChat } from '@/business-logic/chat';

export const GET = withAuth(async (request: NextRequest, user) => {
  try {
    const chats = await getUserChats(user.id);
    return NextResponse.json(chats);
  } catch (error) {
    console.error('Error fetching chats:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 }
    );
  }
});

export const POST = withAuth(async (request: NextRequest, user) => {
  try {
    const body = await request.json();
    const { title } = body;

    const chat = await createChat(
      {
        title: title?.trim() || undefined,
      },
      user.id
    );

    return NextResponse.json(chat, { status: 201 });
  } catch (error) {
    console.error('Error creating chat:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 }
    );
  }
});

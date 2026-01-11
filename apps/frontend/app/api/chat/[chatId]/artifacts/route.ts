import { withAuth } from '@/middlewares/auth';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// Get all artifacts for a chat
export const GET = withAuth(async (request: NextRequest, user, { params }) => {
  try {
    const { chatId } = await params;

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

    // Get all artifacts for the chat, ordered by sequence
    const artifacts = await prisma.artifact.findMany({
      where: { chatId },
      orderBy: { seq: 'asc' },
    });

    return NextResponse.json(artifacts);
  } catch (error) {
    console.error('Error fetching artifacts:', error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : 'Failed to fetch artifacts',
      },
      { status: 500 }
    );
  }
});

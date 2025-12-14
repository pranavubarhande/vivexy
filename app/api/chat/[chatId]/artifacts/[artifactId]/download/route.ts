import { withAuth } from '@/middlewares/auth';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  convertMarkdownToPdf,
  convertMarkdownToWord,
} from '@/lib/markdown-converters';

export const dynamic = 'force-dynamic';

// @ts-expect-error - withAuth wrapper has complex typing with Response vs NextResponse
export const GET = withAuth(async (request: NextRequest, user, { params }) => {
  try {
    const { chatId, artifactId } = await params;
    const { searchParams } = new URL(request.url);
    const format = searchParams.get('format') || 'pdf';

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

    // Get the artifact
    const artifact = await prisma.artifact.findFirst({
      where: {
        id: artifactId,
        chatId,
      },
    });

    if (!artifact) {
      return NextResponse.json(
        { error: 'Artifact not found' },
        { status: 404 }
      );
    }

    // Only allow conversion for MD artifacts
    if (artifact.type !== 'MD') {
      return NextResponse.json(
        { error: 'Download conversion only available for Markdown artifacts' },
        { status: 400 }
      );
    }

    let buffer: Buffer;
    let mimeType: string;
    let fileExtension: string;

    if (format === 'pdf') {
      buffer = await convertMarkdownToPdf(
        artifact.content,
        artifact.title || 'Document'
      );
      mimeType = 'application/pdf';
      fileExtension = 'pdf';
    } else if (format === 'docx') {
      buffer = await convertMarkdownToWord(
        artifact.content,
        artifact.title || 'Document'
      );
      mimeType =
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      fileExtension = 'docx';
    } else {
      return NextResponse.json(
        { error: 'Unsupported format. Use pdf or docx' },
        { status: 400 }
      );
    }

    // Generate filename with correct extension, removing any existing extension
    const baseName = artifact.filename
      ? artifact.filename.replace(/\.[^/.]+$/, '') // Remove existing extension
      : artifact.title || 'artifact';

    const filename = `${baseName}.${fileExtension}`;

    return new Response(new Uint8Array(buffer), {
      headers: {
        'Content-Type': mimeType,
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error('Error downloading artifact:', error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Failed to download artifact',
      },
      { status: 500 }
    );
  }
});

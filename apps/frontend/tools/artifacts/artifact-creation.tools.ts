import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { DynamicStructuredTool } from '@langchain/core/tools';

const createArtifactSchema = z.object({
  chatId: z.string(),
  messageId: z.string().optional(),
  title: z.string().optional(),
  type: z.enum(['MD', 'HTML', 'JS', 'TXT', 'JSON', 'CSV']),
  filename: z.string().optional(),
  language: z.string().optional(),
  content: z.string(),
  metadata: z.any().optional(),
});

export const createArtifact = async (
  input: z.infer<typeof createArtifactSchema>
) => {
  try {
    // Get the next sequence number for this chat
    const lastArtifact = await prisma.artifact.findFirst({
      where: { chatId: input.chatId },
      orderBy: { seq: 'desc' },
    });

    const nextSeq = lastArtifact ? lastArtifact.seq + 1 : 1;

    const artifact = await prisma.artifact.create({
      data: {
        chatId: input.chatId,
        messageId: input.messageId,
        title: input.title,
        type: input.type,
        filename: input.filename,
        language: input.language,
        seq: nextSeq,
        content: input.content,
        metadata: input.metadata || {},
      },
    });

    return {
      success: true,
      artifact: {
        id: artifact.id,
        seq: artifact.seq,
        type: artifact.type,
        title: artifact.title,
        filename: artifact.filename,
      },
    };
  } catch (error) {
    console.error('Failed to create artifact:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
};

export const getArtifactCreationTool = (
  chatId: string
): DynamicStructuredTool => {
  return new DynamicStructuredTool({
    name: 'create_artifact',
    description:
      'Create an artifact (file) for the current chat. Use this to generate reports, code, documents, or any other content that should be saved and displayed to the user. You can create markdown reports, HTML pages, JavaScript code, text files, JSON data, or CSV files.',
    schema: createArtifactSchema.omit({ chatId: true }),
    func: async (input) => {
      const result = await createArtifact({ ...input, chatId });
      return JSON.stringify(result);
    },
  });
};

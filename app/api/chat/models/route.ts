import { NextResponse } from 'next/server';
import { getLLMModels } from '@/business-logic/chat';

export const GET = async () => {
  try {
    const models = await getLLMModels();
    return NextResponse.json(models);
  } catch (error) {
    console.error('Error fetching LLM models:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 }
    );
  }
};
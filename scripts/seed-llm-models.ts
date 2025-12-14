import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const llmModels = [
  // OpenAI Models
  {
    name: 'GPT-4',
    provider: 'openai',
    modelId: 'gpt-4',
    isActive: true,
  },
  {
    name: 'GPT-4 Turbo',
    provider: 'openai',
    modelId: 'gpt-4-turbo',
    isActive: true,
  },
  {
    name: 'GPT-3.5 Turbo',
    provider: 'openai',
    modelId: 'gpt-3.5-turbo',
    isActive: true,
  },

  // Anthropic Claude Models
  {
    name: 'Claude 3 Opus',
    provider: 'anthropic',
    modelId: 'claude-3-opus-20240229',
    isActive: true,
  },
  {
    name: 'Claude 3 Sonnet',
    provider: 'anthropic',
    modelId: 'claude-3-sonnet-20240229',
    isActive: true,
  },
  {
    name: 'Claude 3 Haiku',
    provider: 'anthropic',
    modelId: 'claude-3-haiku-20240307',
    isActive: true,
  },

  // Google Gemini Models
  {
    name: 'Gemini 2.5 Flash',
    provider: 'google',
    modelId: 'gemini-2.5-flash',
    isActive: true,
  },
  {
    name: 'Gemini 1.5 Pro',
    provider: 'google',
    modelId: 'gemini-1.5-pro',
    isActive: true,
  },
  {
    name: 'Gemini 1.5 Flash',
    provider: 'google',
    modelId: 'gemini-1.5-flash',
    isActive: true,
  },
];

async function main() {
  console.log('Seeding LLM models...');

  for (const model of llmModels) {
    const existingModel = await prisma.lLMModel.findFirst({
      where: {
        provider: model.provider,
        modelId: model.modelId,
      },
    });

    if (!existingModel) {
      await prisma.lLMModel.create({
        data: model,
      });
      console.log(`Created model: ${model.name}`);
    } else {
      console.log(`Model already exists: ${model.name}`);
    }
  }

  console.log('Seeding completed!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

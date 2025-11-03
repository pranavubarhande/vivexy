import ChatInterface from '@/components/chat/chat-interface';

interface ChatPageProps {
  params: Promise<{ chatId: string }>;
}

export default async function ChatPage({ params }: ChatPageProps) {
  const { chatId } = await params;

  return <ChatInterface selectedChatId={chatId} />;
}
import { APP_NAME } from '@/constants/project';

export default function DashboardPage() {
  return (
    <div className="flex items-center justify-center h-full">
      <div className="text-center">
        <h1 className="text-2xl font-bold mb-4">Welcome to {APP_NAME}</h1>
        <p className="text-muted-foreground mb-6">
          Select a chat from the sidebar to start conversing with AI models, or
          create a new chat.
        </p>
        <div className="text-sm text-muted-foreground">
          Use the sidebar to navigate between different features of the
          application.
        </div>
      </div>
    </div>
  );
}

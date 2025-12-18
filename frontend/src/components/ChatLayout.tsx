import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { ChatArea } from './ChatArea';
import { ChatInput } from './ChatInput';
import { LoginPage } from './LoginPage';
import { AgentActivityDialog } from './AgentActivityDialog';
import { Button } from '@/components/ui/button';
import { Activity } from 'lucide-react';
import { useChat } from '@/hooks/useChat';
import { useTheme } from '@/hooks/useTheme';

interface User {
  email: string;
  name?: string;
  customer_id?: string;
}

export function ChatLayout({ chatId }: { chatId?: string } = {}) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [user, setUser] = useState<User | null>(() => {
    // Check for customer from ref link first (set by App.tsx)
    const customer = localStorage.getItem('customer');
    if (customer) {
      const customerData = JSON.parse(customer);
      return {
        email: customerData.email,
        name: customerData.name,
        customer_id: customerData.customer_id
      };
    }

    // Fallback to user storage
    const savedUser = localStorage.getItem('user');
    return savedUser ? JSON.parse(savedUser) : null;
  });
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginLoading, setLoginLoading] = useState(false);

  const { resolvedTheme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  
  const {
    messages,
    isLoading,
    isLoadingSessions,
    currentToolCall,
    sessions,
    currentSessionId,
    agentDecisions,
    sendMessage,
    newSession,
    loadSession,
    deleteSession,
  } = useChat({
    initialSessionId: chatId,
    onNavigate: navigate
  });

  const [activityDialogOpen, setActivityDialogOpen] = useState(false);

  const handleSuggestionClick = useCallback((suggestion: string) => {
    sendMessage(suggestion);
  }, [sendMessage]);

  const handleLogin = useCallback((email: string, _password: string) => {
    setLoginLoading(true);
    setLoginError(null);

    // Simulate login delay
    setTimeout(() => {
      const userData = { email };
      setUser(userData);
      localStorage.setItem('user', JSON.stringify(userData));
      setLoginLoading(false);
    }, 800);
  }, []);

  const handleLogout = useCallback(() => {
    setUser(null);
    localStorage.removeItem('user');
    localStorage.removeItem('customer');
  }, []);

  // Show login page if not authenticated
  if (!user) {
    return (
      <LoginPage
        onLogin={handleLogin}
        isLoading={loginLoading}
        error={loginError}
      />
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Sidebar */}
      <Sidebar
        isOpen={sidebarOpen}
        onToggle={() => setSidebarOpen(!sidebarOpen)}
        sessions={sessions}
        currentSessionId={currentSessionId}
        onNewChat={newSession}
        onSelectSession={loadSession}
        onDeleteSession={deleteSession}
        isLoadingSessions={isLoadingSessions}
        theme={resolvedTheme}
        onToggleTheme={toggleTheme}
        user={user}
        onLogout={handleLogout}
      />

      {/* Main Chat Area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Header with Agent Activity Button */}
        {messages.length > 0 && (
          <div className="flex items-center justify-end px-4 py-2 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setActivityDialogOpen(true)}
              className="gap-2 cursor-pointer"
            >
              <Activity className="size-4" />
              <span className="hidden sm:inline">Agent Activity</span>
              {agentDecisions.length > 0 && (
                <span className="ml-1 flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-medium">
                  {agentDecisions.length}
                </span>
              )}
            </Button>
          </div>
        )}

        {/* Chat Messages */}
        <ChatArea
          messages={messages}
          isLoading={isLoading}
          currentToolCall={currentToolCall}
          onSuggestionClick={handleSuggestionClick}
        />

        {/* Chat Input */}
        <ChatInput
          onSend={sendMessage}
          isLoading={isLoading}
        />
      </div>

      {/* Agent Activity Dialog */}
      <AgentActivityDialog
        isOpen={activityDialogOpen}
        onClose={() => setActivityDialogOpen(false)}
        decisions={agentDecisions}
      />
    </div>
  );
}

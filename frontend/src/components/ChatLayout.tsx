import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { ChatArea } from './ChatArea';
import { ChatInput } from './ChatInput';
import { LoginPage } from './LoginPage';
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
    sendMessage,
    newSession,
    loadSession,
    deleteSession,
  } = useChat({
    initialSessionId: chatId,
    onNavigate: navigate
  });

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
    </div>
  );
}

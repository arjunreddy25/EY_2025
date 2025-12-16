import { useState, useCallback } from 'react';
import { Sidebar } from './Sidebar';
import { ChatArea } from './ChatArea';
import { ChatInput } from './ChatInput';
import { LoginPage } from './LoginPage';
import { useChat } from '@/hooks/useChat';
import { useTheme } from '@/hooks/useTheme';

interface User {
  email: string;
}

export function ChatLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [user, setUser] = useState<User | null>(() => {
    // Check localStorage for existing session
    const savedUser = localStorage.getItem('user');
    return savedUser ? JSON.parse(savedUser) : null;
  });
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginLoading, setLoginLoading] = useState(false);

  const { resolvedTheme, toggleTheme } = useTheme();
  
  const {
    messages,
    isLoading,
    currentToolCall,
    sessions,
    currentSessionId,
    sendMessage,
    newSession,
    loadSession,
  } = useChat();

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

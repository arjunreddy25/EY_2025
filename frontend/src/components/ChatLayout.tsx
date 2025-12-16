import { useState, useCallback } from 'react';
import { Sidebar } from './Sidebar';
import { ChatArea } from './ChatArea';
import { ChatInput } from './ChatInput';
import { useChat } from '@/hooks/useChat';
import { useTheme } from '@/hooks/useTheme';

export function ChatLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
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

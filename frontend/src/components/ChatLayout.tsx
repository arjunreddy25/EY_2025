import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { ChatArea } from './ChatArea';
import { ChatInput } from './ChatInput';
import { PhoneVerification } from './PhoneVerification';
import { KYCDialog } from './KYCDialog';
import { AgentActivityDialog } from './AgentActivityDialog';
import { Button } from '@/components/ui/button';
import { Activity } from 'lucide-react';
import { useChat } from '@/hooks/useChat';
import { useTheme } from '@/hooks/useTheme';

interface User {
  email: string;
  name?: string;
  customer_id?: string;
  phone?: string;
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
        customer_id: customerData.customer_id,
        phone: customerData.phone
      };
    }

    // Fallback to user storage
    const savedUser = localStorage.getItem('user');
    return savedUser ? JSON.parse(savedUser) : null;
  });

  // KYC dialog state for new users
  const [kycDialogOpen, setKycDialogOpen] = useState(false);
  const [pendingPhone, setPendingPhone] = useState('');

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

  const handleVerified = useCallback((customer: { customer_id: string; name: string; email: string; phone: string }) => {
    setUser({
      email: customer.email,
      name: customer.name,
      customer_id: customer.customer_id,
      phone: customer.phone
    });
    // Reload page to reinitialize chat with customer context
    window.location.reload();
  }, []);

  const handleNewUser = useCallback((phone: string) => {
    // Open KYC dialog for new users
    setPendingPhone(phone);
    setKycDialogOpen(true);
  }, []);

  const handleLogout = useCallback(() => {
    setUser(null);
    localStorage.removeItem('user');
    localStorage.removeItem('customer');
  }, []);

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
          latestAgentStatus={agentDecisions.length > 0 ? agentDecisions[agentDecisions.length - 1].summary : null}
          onSuggestionClick={handleSuggestionClick}
        />

        {/* Phone Verification - show if no user */}
        {!user && (
          <PhoneVerification
            onVerified={handleVerified}
            onNewUser={handleNewUser}
          />
        )}

        {/* Chat Input - only enabled if user is verified */}
        <ChatInput
          onSend={sendMessage}
          isLoading={isLoading}
          disabled={!user}
        />
      </div>

      {/* Agent Activity Dialog */}
      <AgentActivityDialog
        isOpen={activityDialogOpen}
        onClose={() => setActivityDialogOpen(false)}
        decisions={agentDecisions}
      />

      {/* KYC Dialog for new users */}
      <KYCDialog
        isOpen={kycDialogOpen}
        onClose={() => setKycDialogOpen(false)}
        phone={pendingPhone}
      />
    </div>
  );
}

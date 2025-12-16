import { useRef, useEffect } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { MessageBubble, MessageListSkeleton } from './MessageBubble';
import { TypingIndicator } from './TypingIndicator';
import { WelcomeScreen } from './WelcomeScreen';
import type { Message } from '@/hooks/useChat';

interface ChatAreaProps {
  messages: Message[];
  isLoading: boolean;
  currentToolCall?: string | null;
  onSuggestionClick?: (suggestion: string) => void;
}

export function ChatArea({ 
  messages, 
  isLoading, 
  currentToolCall,
  onSuggestionClick 
}: ChatAreaProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  if (messages.length === 0 && !isLoading) {
    return <WelcomeScreen onSuggestionClick={onSuggestionClick} />;
  }

  return (
    <ScrollArea className="flex-1" ref={scrollRef}>
      <div className="mx-auto max-w-3xl pb-4">
        {messages.length === 0 && isLoading ? (
          <MessageListSkeleton />
        ) : (
          <>
            {messages.map((message) => (
              <MessageBubble key={message.id} message={message} />
            ))}
            
            {isLoading && !messages[messages.length - 1]?.isStreaming && (
              <TypingIndicator toolName={currentToolCall} />
            )}
          </>
        )}
        <div ref={bottomRef} />
      </div>
    </ScrollArea>
  );
}

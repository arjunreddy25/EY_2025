import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Copy, Check, Wrench } from 'lucide-react';
import { useState } from 'react';
import type { Message, ToolCall } from '@/hooks/useChat';

interface MessageBubbleProps {
  message: Message;
}

function ToolCallBadge({ toolCall }: { toolCall: ToolCall }) {
  const isCompleted = toolCall.status === 'completed';
  
  return (
    <Badge 
      variant={isCompleted ? "secondary" : "outline"}
      className={cn(
        "gap-1.5 text-xs font-normal",
        !isCompleted && "animate-pulse"
      )}
    >
      <Wrench className="size-3" />
      <span className="capitalize">{toolCall.tool.replace(/_/g, ' ')}</span>
      {toolCall.agent && (
        <span className="text-muted-foreground">({toolCall.agent})</span>
      )}
    </Badge>
  );
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const [copied, setCopied] = useState(false);
  const isUser = message.role === 'user';

  const handleCopy = async () => {
    await navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      className={cn(
        "group flex w-full gap-3 px-4 py-6",
        isUser ? "justify-end" : "justify-start"
      )}
    >
      <div
        className={cn(
          "relative max-w-[80%] lg:max-w-[70%]",
          isUser ? "order-1" : "order-1"
        )}
      >
        {/* Role label */}
        <div className={cn(
          "mb-2 text-xs font-medium uppercase tracking-wide",
          isUser ? "text-right text-primary" : "text-left text-muted-foreground"
        )}>
          {isUser ? 'You' : 'Loan Assistant'}
        </div>

        {/* Message container */}
        <div
          className={cn(
            "relative rounded-2xl px-4 py-3 text-sm leading-relaxed",
            isUser
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-foreground"
          )}
        >
          {/* Tool calls */}
          {message.toolCalls && message.toolCalls.length > 0 && (
            <div className="mb-3 flex flex-wrap gap-2">
              {message.toolCalls.map((tc, idx) => (
                <ToolCallBadge key={idx} toolCall={tc} />
              ))}
            </div>
          )}

          {/* Message content or skeleton */}
          {message.isStreaming && !message.content ? (
            <MessageSkeleton />
          ) : (
            <div className="whitespace-pre-wrap break-words">
              {message.content}
              {message.isStreaming && (
                <span className="ml-1 inline-block h-4 w-1 animate-pulse bg-current" />
              )}
            </div>
          )}
        </div>

        {/* Copy button for assistant messages */}
        {!isUser && message.content && !message.isStreaming && (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={handleCopy}
            className="absolute -bottom-8 left-0 opacity-0 transition-opacity group-hover:opacity-100"
          >
            {copied ? (
              <Check className="size-3.5 text-green-500" />
            ) : (
              <Copy className="size-3.5" />
            )}
          </Button>
        )}

        {/* Timestamp */}
        <div className={cn(
          "mt-1 text-[10px] text-muted-foreground",
          isUser ? "text-right" : "text-left"
        )}>
          {message.timestamp.toLocaleTimeString([], { 
            hour: '2-digit', 
            minute: '2-digit' 
          })}
        </div>
      </div>
    </div>
  );
}

export function MessageSkeleton() {
  return (
    <div className="space-y-2">
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-4/5" />
      <Skeleton className="h-4 w-3/5" />
    </div>
  );
}

export function MessageListSkeleton() {
  return (
    <div className="space-y-6 p-4">
      {/* User message skeleton */}
      <div className="flex justify-end">
        <div className="max-w-[70%] space-y-2">
          <Skeleton className="ml-auto h-3 w-12" />
          <Skeleton className="h-16 w-64 rounded-2xl" />
        </div>
      </div>
      
      {/* Assistant message skeleton */}
      <div className="flex justify-start">
        <div className="max-w-[70%] space-y-2">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-32 w-80 rounded-2xl" />
        </div>
      </div>
    </div>
  );
}

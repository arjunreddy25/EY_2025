import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Copy, Check, Wrench, Download } from 'lucide-react';
import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
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
        "group flex w-full gap-3 px-4 py-4",
        isUser ? "justify-end" : "justify-start"
      )}
    >
      <div
        className={cn(
          "relative max-w-[85%] lg:max-w-[75%]",
          isUser ? "order-1" : "order-1"
        )}
      >
        {/* Message container */}
        <div
          className={cn(
            "relative rounded-2xl px-4 py-3 text-sm leading-relaxed",
            isUser
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-foreground"
          )}
        >
          {/* Tool calls - only show during streaming, filter out internal delegation tools */}
          {message.isStreaming && message.toolCalls && message.toolCalls.length > 0 && (() => {
            // Filter out internal agent delegation tools
            const visibleTools = message.toolCalls.filter(tc =>
              !tc.tool.includes('transfer_task') &&
              !tc.tool.includes('delegate') &&
              tc.tool !== 'transfer_task_to_member'
            );
            return visibleTools.length > 0 ? (
              <div className="mb-3 flex flex-wrap gap-2">
                {visibleTools.map((tc, idx) => (
                  <ToolCallBadge key={idx} toolCall={tc} />
                ))}
              </div>
            ) : null;
          })()}

          {/* Message content or skeleton */}
          {message.isStreaming && !message.content ? (
            <MessageSkeleton />
          ) : isUser ? (
            <div className="whitespace-pre-wrap break-words">
              {message.content}
              </div>
            ) : (
              <div className="prose prose-sm dark:prose-invert max-w-none prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5 prose-headings:my-2">
                <ReactMarkdown>
                  {message.content}
                </ReactMarkdown>
              {message.isStreaming && (
                <span className="ml-1 inline-block h-4 w-1 animate-pulse bg-current" />
              )}
            </div>
          )}
        </div>

        {/* Action buttons for assistant messages */}
        {!isUser && message.content && !message.isStreaming && (
          <div className="mt-2 flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCopy}
              className="h-7 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
            >
              {copied ? (
                <>
                  <Check className="size-3 text-green-500" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="size-3" />
                  Copy
                </>
              )}
            </Button>

            {message.pdfUrl && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  // Create a hidden link and trigger download
                  const link = document.createElement('a');
                  link.href = message.pdfUrl!;
                  link.download = message.letterId ? `${message.letterId}.pdf` : 'sanction_letter.pdf';
                  link.target = '_blank';
                  document.body.appendChild(link);
                  link.click();
                  document.body.removeChild(link);
                }}
                className="h-7 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
              >
                <Download className="size-3" />
                Download Sanction Letter
              </Button>
            )}
          </div>
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
          <Skeleton className="h-16 w-64 rounded-2xl" />
        </div>
      </div>
      
      {/* Assistant message skeleton */}
      <div className="flex justify-start">
        <div className="max-w-[70%] space-y-2">
          <Skeleton className="h-32 w-80 rounded-2xl" />
        </div>
      </div>
    </div>
  );
}

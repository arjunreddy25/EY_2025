import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Copy, Check, Download, Loader2 } from 'lucide-react';
import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import type { Message } from '@/hooks/useChat';
import { TypingIndicator } from './TypingIndicator';

interface MessageBubbleProps {
  message: Message;
  agentStatus?: string | null;
}

// Format tool name for display - show exactly what's happening
function formatToolName(toolName: string): string {
  // Just clean up the tool name, don't hide anything
  return toolName.replace(/_/g, ' ');
}

export function MessageBubble({ message, agentStatus }: MessageBubbleProps) {
  const [copied, setCopied] = useState(false);
  const isUser = message.role === 'user';

  const handleCopy = async () => {
    await navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Get current tool being executed (show ALL tools, no filtering)
  const currentTool = message.toolCalls?.find(tc => tc.status === 'started');

  // Build status text: current tool with agent > agentStatus > null
  const streamingStatus = currentTool
    ? `${formatToolName(currentTool.tool)}${currentTool.agent ? ` (${currentTool.agent})` : ''}`
    : agentStatus;

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

          {/* Message content or typing indicator */}
          {message.isStreaming && !message.content ? (
            <TypingIndicator
              toolName={currentTool?.tool}
              statusText={agentStatus}
            />
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

          {/* Streaming status line - shows current activity during streaming */}
          {message.isStreaming && message.content && streamingStatus && (
            <div className="mt-2 pt-2 border-t border-border/50 flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="size-3 animate-spin" />
              <span>{streamingStatus}...</span>
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

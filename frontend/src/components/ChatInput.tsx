import { useState, useRef, useCallback, type KeyboardEvent, type ChangeEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Send, Paperclip, X, FileText, Image } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ChatInputProps {
  onSend: (message: string, file?: File) => void;
  isLoading?: boolean;
  disabled?: boolean;
}

export function ChatInput({ onSend, isLoading = false, disabled = false }: ChatInputProps) {
  const [message, setMessage] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSend = useCallback(() => {
    if ((!message.trim() && !file) || isLoading || disabled) return;
    
    onSend(message.trim(), file || undefined);
    setMessage('');
    setFile(null);
    
    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [message, file, isLoading, disabled, onSend]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleTextareaChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    setMessage(e.target.value);
    
    // Auto-resize textarea
    const textarea = e.target;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 150)}px`;
  };

  const handleFileSelect = (e: ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
    }
  };

  const removeFile = () => {
    setFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const canSend = (message.trim() || file) && !isLoading && !disabled;
  const isImage = file?.type.startsWith('image/');

  return (
    <TooltipProvider>
      <div className="shrink-0 border-t bg-background px-4 py-3">
        <div className="mx-auto max-w-3xl">
          {/* Input container with file preview inside */}
          <div className="relative rounded-2xl border bg-muted/30 shadow-sm transition-shadow focus-within:shadow-md">
            {/* File attachment preview - inside the input container */}
            {file && (
              <div className="flex items-center gap-2 border-b px-3 py-2">
                {isImage ? (
                  <Image className="size-4 text-blue-500" />
                ) : (
                  <FileText className="size-4 text-orange-500" />
                )}
                <span className="flex-1 truncate text-sm text-muted-foreground">{file.name}</span>
                <span className="text-xs text-muted-foreground">
                  {(file.size / 1024).toFixed(1)}KB
                </span>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={removeFile}
                  className="size-6 hover:bg-destructive/10 hover:text-destructive"
                >
                  <X className="size-3.5" />
                </Button>
              </div>
            )}

            {/* Input row */}
            <div className="flex items-end gap-2 p-2">
              {/* File upload button */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={disabled}
                    className="shrink-0"
                  >
                    <Paperclip className="size-5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">
                  Attach salary slip (Image only)
                </TooltipContent>
              </Tooltip>

              <input
                ref={fileInputRef}
                type="file"
                accept=".png,.jpg,.jpeg,.webp"
                onChange={handleFileSelect}
                className="hidden"
              />

              {/* Message textarea */}
              <Textarea
                ref={textareaRef}
                value={message}
                onChange={handleTextareaChange}
                onKeyDown={handleKeyDown}
                placeholder="Message Loan Assistant..."
                disabled={disabled}
                className={cn(
                  "min-h-[44px] max-h-[150px] flex-1 resize-none border-0 bg-transparent px-2 py-3",
                  "placeholder:text-muted-foreground/60 focus-visible:ring-0 focus-visible:ring-offset-0"
                )}
                rows={1}
              />

              {/* Send button */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    onClick={handleSend}
                    disabled={!canSend}
                    size="icon"
                    className={cn(
                      "shrink-0 transition-all",
                      canSend
                        ? "bg-primary text-primary-foreground hover:bg-primary/90"
                        : "bg-muted text-muted-foreground"
                    )}
                  >
                    {isLoading ? (
                      <div className="size-5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                    ) : (
                      <Send className="size-5" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">
                  {isLoading ? 'Sending...' : 'Send message'}
                </TooltipContent>
              </Tooltip>
            </div>
          </div>

          {/* Hint text */}
          <p className="mt-2 text-center text-xs text-muted-foreground">
            Press Enter to send, Shift + Enter for new line
          </p>
        </div>
      </div>
    </TooltipProvider>
  );
}

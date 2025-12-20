import { useState, useRef, useCallback, type KeyboardEvent, type ChangeEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Send, Paperclip, X, FileText, Image, Phone, ArrowRight, Loader2, KeyRound } from 'lucide-react';
import { cn } from '@/lib/utils';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

interface ChatInputProps {
  onSend: (message: string, file?: File) => void;
  isLoading?: boolean;
  disabled?: boolean;
  showPhoneInput?: boolean;
  onPhoneVerified?: (customer: { customer_id: string; name: string; email: string; phone: string }) => void;
  onNewUser?: (phone: string) => void;
}

export function ChatInput({
  onSend,
  isLoading = false,
  disabled = false,
  showPhoneInput = false,
  onPhoneVerified,
  onNewUser
}: ChatInputProps) {
  const [message, setMessage] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Phone verification state
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [phoneStep, setPhoneStep] = useState<'phone' | 'otp'>('phone');
  const [isVerifying, setIsVerifying] = useState(false);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [pendingCustomer, setPendingCustomer] = useState<any>(null);

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

  // Phone verification handlers
  const handlePhoneSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const cleanPhone = phone.replace(/\D/g, '');
    if (cleanPhone.length < 10) {
      setPhoneError('Please enter a valid 10-digit phone number');
      return;
    }

    setIsVerifying(true);
    setPhoneError(null);

    try {
      const response = await fetch(`${API_BASE}/auth/lookup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: cleanPhone })
      });

      const data = await response.json();

      if (data.exists) {
        setPendingCustomer({
          customer_id: data.customer_id,
          name: data.name,
          email: data.email,
          phone: cleanPhone
        });
        setPhoneStep('otp');
      } else {
        onNewUser?.(cleanPhone);
      }
    } catch (err) {
      console.error('Lookup failed:', err);
      setPhoneError('Unable to verify. Please try again.');
    } finally {
      setIsVerifying(false);
    }
  };

  const handleOtpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Demo OTP: 123456
    if (otp !== '123456') {
      setPhoneError('Invalid OTP. Try 123456');
      return;
    }

    setIsVerifying(true);
    await new Promise(resolve => setTimeout(resolve, 500));

    if (pendingCustomer) {
      localStorage.setItem('customer', JSON.stringify(pendingCustomer));
      localStorage.setItem('user', JSON.stringify(pendingCustomer));
      onPhoneVerified?.(pendingCustomer);
    }

    setIsVerifying(false);
  };

  const canSend = (message.trim() || file) && !isLoading && !disabled;
  const isImage = file?.type.startsWith('image/');

  return (
    <TooltipProvider>
      <div className="shrink-0 border-t bg-background px-4 py-3">
        <div className="mx-auto max-w-3xl">
          {/* Input container with file preview and phone input */}
          <div className="relative rounded-2xl border bg-muted/30 shadow-sm transition-shadow focus-within:shadow-md">

            {/* Phone verification section - attached on top like file preview */}
            {showPhoneInput && (
              <div className="border-b px-3 py-3 transition-all duration-300 ease-in-out">
                {phoneStep === 'phone' ? (
                  <form onSubmit={handlePhoneSubmit} className="flex items-center gap-2">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Phone className="size-4" />
                      <span className="text-sm hidden sm:inline">Verify to continue:</span>
                    </div>
                    <Input
                      type="tel"
                      placeholder="Enter phone number"
                      value={phone}
                      onChange={(e) => {
                        setPhone(e.target.value);
                        setPhoneError(null);
                      }}
                      className="flex-1 max-w-xs h-9"
                      disabled={isVerifying}
                      autoFocus
                    />
                    <Button
                      type="submit"
                      size="sm"
                      className="h-9 cursor-pointer"
                      disabled={isVerifying || !phone.trim()}
                    >
                      {isVerifying ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <>
                          Send OTP
                          <ArrowRight className="size-4 ml-1" />
                        </>
                      )}
                    </Button>
                    {phoneError && <span className="text-destructive text-sm">{phoneError}</span>}
                  </form>
                ) : (
                  <form onSubmit={handleOtpSubmit} className="flex items-center gap-2">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <KeyRound className="size-4" />
                      <span className="text-sm">Enter OTP sent to {phone}:</span>
                    </div>
                    <Input
                      type="text"
                      placeholder="123456"
                      value={otp}
                      onChange={(e) => {
                        setOtp(e.target.value.replace(/\D/g, '').slice(0, 6));
                        setPhoneError(null);
                      }}
                      className="w-28 h-9 text-center tracking-widest"
                      disabled={isVerifying}
                      autoFocus
                      maxLength={6}
                    />
                    <Button
                      type="submit"
                      size="sm"
                      className="h-9 cursor-pointer"
                      disabled={isVerifying || otp.length !== 6}
                    >
                      {isVerifying ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        'Verify'
                      )}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-9 cursor-pointer"
                      onClick={() => {
                        setPhoneStep('phone');
                        setOtp('');
                        setPhoneError(null);
                      }}
                    >
                      Change
                    </Button>
                    {phoneError && <span className="text-destructive text-sm">{phoneError}</span>}
                  </form>
                )}
              </div>
            )}

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
                    disabled={disabled || showPhoneInput}
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
                placeholder={showPhoneInput ? "Verify phone to start chatting..." : "Message Loan Assistant..."}
                disabled={disabled || showPhoneInput}
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
                    disabled={!canSend || showPhoneInput}
                    size="icon"
                    className={cn(
                      "shrink-0 transition-all",
                      canSend && !showPhoneInput
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
            {showPhoneInput ? 'Demo OTP: 123456' : 'Press Enter to send, Shift + Enter for new line'}
          </p>
        </div>
      </div>
    </TooltipProvider>
  );
}

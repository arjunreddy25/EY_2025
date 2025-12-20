import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Skeleton } from '@/components/ui/skeleton';
import { useState } from 'react';
import { 
  Plus, 
  MessageSquare, 
  Sun, 
  Moon, 
  PanelLeftClose, 
  PanelLeft,
  Trash2,
  CreditCard,
  LogOut,
  User,
  Wallet,
  Phone
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ChatSession } from '@/hooks/useChat';
import { MyLoansDrawer } from './MyLoansDrawer';

interface SidebarProps {
  isOpen: boolean;
  onToggle: () => void;
  sessions: ChatSession[];
  currentSessionId: string;
  onNewChat: () => void;
  onSelectSession: (session: ChatSession) => void;
  onDeleteSession?: (sessionId: string) => void;
  isLoadingSessions?: boolean;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  user?: { email: string } | null;
  onLogout?: () => void;
}

export function Sidebar({
  isOpen,
  onToggle,
  sessions,
  currentSessionId,
  onNewChat,
  onSelectSession,
  onDeleteSession,
  isLoadingSessions = false,
  theme,
  onToggleTheme,
  user,
  onLogout,
}: SidebarProps) {
  const [isLoansDrawerOpen, setIsLoansDrawerOpen] = useState(false);

  return (
    <>
    <TooltipProvider>
      <div
        className={cn(
          "flex h-full flex-col overflow-hidden border-r bg-sidebar text-sidebar-foreground transition-all duration-300",
          isOpen ? "w-72" : "w-16"
        )}
      >
        {/* Header with Logo */}
        <div className={cn(
          "flex items-center p-4",
          isOpen ? "gap-3" : "justify-center"
        )}>
          {isOpen && (
            <>
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-md">
                <CreditCard className="size-5" />
              </div>
              <div className="flex-1 min-w-0">
                <h1 className="font-bold text-lg leading-tight">NBFC Loans</h1>
                <p className="text-xs text-muted-foreground truncate">Personal Loan Assistant</p>
              </div>
            </>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={onToggle}
                className="shrink-0"
              >
                {isOpen ? <PanelLeftClose className="size-4" /> : <PanelLeft className="size-4" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">
              {isOpen ? 'Collapse' : 'Expand'}
            </TooltipContent>
          </Tooltip>
        </div>

        <Separator />

        {/* New Chat Button */}
        <div className="p-3">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                onClick={onNewChat}
                className={cn(
                  "cursor-pointer w-full gap-2 bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm",
                  !isOpen && "justify-center px-0"
                )}
              >
                <Plus className="size-4" />
                {isOpen && <span>New Chat</span>}
              </Button>
            </TooltipTrigger>
            {!isOpen && (
              <TooltipContent side="right">New Chat</TooltipContent>
            )}
          </Tooltip>
        </div>

        {/* Chat History */}
        <ScrollArea className="flex-1 min-h-0">
          <div className="px-3">
              {/* Not logged in message */}
              {isOpen && !user && (
                <div className="py-12 text-center">
                  <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-muted">
                    <Phone className="size-6 text-muted-foreground" />
                  </div>
                  <p className="text-sm font-medium">No access yet</p>
                  <p className="mt-1 text-xs text-muted-foreground px-4">
                    Input your phone number to access the chats
                  </p>
                </div>
              )}

            {/* Skeleton Loading */}
              {isOpen && user && isLoadingSessions && (
              <div className="space-y-2 py-2">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="flex items-center gap-3 px-3 py-2">
                    <Skeleton className="size-4 rounded" />
                    <Skeleton className="h-4 flex-1" />
                  </div>
                ))}
              </div>
            )}

            {/* Sessions List - Simple flat list, no date grouping */}
              {isOpen && user && !isLoadingSessions && sessions.length > 0 && (
              <div className="space-y-1 py-2">
                {sessions.map((session) => (
                  <div
                    key={session.id}
                    onClick={() => onSelectSession(session)}
                    className={`group w-full flex flex-row items-center justify-between gap-2 px-3 py-2.5 rounded-md cursor-pointer text-left ${session.id === currentSessionId
                      ? 'bg-secondary text-secondary-foreground'
                      : 'hover:bg-accent hover:text-accent-foreground'
                      }`}
                  >
                    <span className="flex-1 text-sm min-w-0 truncate">
                      {session.title || 'New Chat'}
                    </span>
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onDeleteSession?.(session.id);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          e.stopPropagation();
                          onDeleteSession?.(session.id);
                        }
                      }}
                      className="size-5 shrink-0 opacity-0 transition-opacity group-hover:opacity-100 text-muted-foreground hover:text-destructive flex items-center justify-center cursor-pointer"
                      aria-label="Delete chat"
                    >
                      <Trash2 className="size-4" />
                    </div>
                  </div>
                ))}
              </div>
            )}

              {/* Empty State - only show when logged in */}
              {isOpen && user && !isLoadingSessions && sessions.length === 0 && (
              <div className="py-12 text-center">
                <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-muted">
                  <MessageSquare className="size-6 text-muted-foreground" />
                </div>
                <p className="text-sm font-medium">No conversations yet</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Start a new chat to get loan assistance
                </p>
              </div>
            )}

            {/* When sidebar is collapsed, don't show session icons - just empty space */}
          </div>
        </ScrollArea>

        <Separator />

        {/* Bottom Section */}
        <div className="shrink-0 p-3 space-y-1">
          {/* Help */}
          {/* <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size={isOpen ? "default" : "icon"}
                className={cn(
                  "w-full gap-3",
                  isOpen ? "justify-start px-3" : "justify-center"
                )}
              >
                <HelpCircle className="size-4" />
                {isOpen && <span>Help & FAQ</span>}
              </Button>
            </TooltipTrigger>
            {!isOpen && (
              <TooltipContent side="right">Help & FAQ</TooltipContent>
            )}
          </Tooltip> */}

            {/* My Loans Button - Only show when user is logged in */}
            {user && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size={isOpen ? "default" : "icon"}
                    onClick={() => setIsLoansDrawerOpen(true)}
                    className={cn(
                      "w-full gap-3 cursor-pointer",
                      isOpen ? "justify-start px-3" : "justify-center"
                    )}
                  >
                    <Wallet className="size-4" />
                    {isOpen && <span>My Loans</span>}
                  </Button>
                </TooltipTrigger>
                {!isOpen && (
                  <TooltipContent side="right">My Loans</TooltipContent>
                )}
              </Tooltip>
            )}

          {/* Theme Toggle */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size={isOpen ? "default" : "icon"}
                onClick={onToggleTheme}
                className={cn(
                  "w-full gap-3",
                  isOpen ? "justify-start px-3" : "justify-center"
                )}
              >
                {theme === 'dark' ? (
                  <>
                    <Sun className="size-4" />
                    {isOpen && <span>Light Mode</span>}
                  </>
                ) : (
                  <>
                    <Moon className="size-4" />
                    {isOpen && <span>Dark Mode</span>}
                  </>
                )}
              </Button>
            </TooltipTrigger>
            {!isOpen && (
              <TooltipContent side="right">
                {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
              </TooltipContent>
            )}
          </Tooltip>

          <Separator className="my-2" />

          {/* User Section */}
          {user ? (
            <div className={cn(
              "flex items-center gap-3 rounded-lg p-2",
              isOpen ? "bg-muted/50" : ""
            )}>
              <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <User className="size-4" />
              </div>
              {isOpen && (
                <>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{user.email}</p>
                    <p className="text-[10px] text-muted-foreground">Logged in</p>
                  </div>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={onLogout}
                        className="shrink-0"
                      >
                        <LogOut className="size-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Logout</TooltipContent>
                  </Tooltip>
                </>
              )}
            </div>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size={isOpen ? "default" : "icon"}
                  className={cn(
                    "w-full gap-3",
                    isOpen ? "justify-start px-3" : "justify-center"
                  )}
                >
                  <User className="size-4" />
                  {isOpen && <span>Login</span>}
                </Button>
              </TooltipTrigger>
              {!isOpen && (
                <TooltipContent side="right">Login</TooltipContent>
              )}
            </Tooltip>
          )}
        </div>
      </div>
    </TooltipProvider>

      {/* My Loans Drawer */}
      <MyLoansDrawer
        isOpen={isLoansDrawerOpen}
        onClose={() => setIsLoansDrawerOpen(false)}
      />
    </>
  );
}

import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
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
  HelpCircle,
  User
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ChatSession } from '@/hooks/useChat';

interface SidebarProps {
  isOpen: boolean;
  onToggle: () => void;
  sessions: ChatSession[];
  currentSessionId: string;
  onNewChat: () => void;
  onSelectSession: (session: ChatSession) => void;
  onDeleteSession?: (sessionId: string) => void;
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
  theme,
  onToggleTheme,
  user,
  onLogout,
}: SidebarProps) {
  const groupedSessions = groupSessionsByDate(sessions);

  return (
    <TooltipProvider>
      <div
        className={cn(
          "flex h-full flex-col border-r bg-sidebar text-sidebar-foreground transition-all duration-300",
          isOpen ? "w-72" : "w-16"
        )}
      >
        {/* Header with Logo */}
        <div className="flex items-center gap-3 p-4">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-md">
            <CreditCard className="size-5" />
          </div>
          {isOpen && (
            <div className="flex-1 min-w-0">
              <h1 className="font-bold text-lg leading-tight">NBFC Loans</h1>
              <p className="text-xs text-muted-foreground truncate">Personal Loan Assistant</p>
            </div>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
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
                  "w-full gap-2 bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm",
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
        <ScrollArea className="flex-1">
          <div className="px-3">
            {isOpen && sessions.length > 0 && (
              <div className="space-y-4 py-2">
                {Object.entries(groupedSessions).map(([label, groupSessions]) => (
                  <div key={label}>
                    <p className="mb-2 px-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                      {label}
                    </p>
                    <div className="space-y-1">
                      {groupSessions.map((session) => (
                        <Button
                          key={session.id}
                          variant={session.id === currentSessionId ? "secondary" : "ghost"}
                          onClick={() => onSelectSession(session)}
                          className="group w-full justify-start gap-3 px-3 py-2 h-auto text-left"
                        >
                          <MessageSquare className="size-4 shrink-0 text-muted-foreground" />
                          <div className="flex-1 min-w-0">
                            <span className="block truncate text-sm">
                              {session.title}
                            </span>
                            <span className="block text-[10px] text-muted-foreground">
                              {session.createdAt.toLocaleDateString()}
                            </span>
                          </div>
                          <Trash2
                            className="size-4 shrink-0 opacity-0 transition-opacity group-hover:opacity-100 text-muted-foreground hover:text-destructive"
                            onClick={(e) => {
                              e.stopPropagation();
                              onDeleteSession?.(session.id);
                            }}
                          />
                        </Button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {isOpen && sessions.length === 0 && (
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

            {!isOpen && sessions.length > 0 && (
              <div className="space-y-1 py-2">
                {sessions.slice(0, 6).map((session) => (
                  <Tooltip key={session.id}>
                    <TooltipTrigger asChild>
                      <Button
                        variant={session.id === currentSessionId ? "secondary" : "ghost"}
                        size="icon"
                        onClick={() => onSelectSession(session)}
                        className="mx-auto"
                      >
                        <MessageSquare className="size-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="right">
                      {session.title}
                    </TooltipContent>
                  </Tooltip>
                ))}
              </div>
            )}
          </div>
        </ScrollArea>

        <Separator />

        {/* Bottom Section */}
        <div className="p-3 space-y-1">
          {/* Help */}
          <Tooltip>
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
          </Tooltip>

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
  );
}

function groupSessionsByDate(sessions: ChatSession[]): Record<string, ChatSession[]> {
  const groups: Record<string, ChatSession[]> = {};
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
  const lastWeek = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);

  sessions.forEach((session) => {
    const sessionDate = new Date(session.createdAt);
    let label: string;

    if (sessionDate >= today) {
      label = 'Today';
    } else if (sessionDate >= yesterday) {
      label = 'Yesterday';
    } else if (sessionDate >= lastWeek) {
      label = 'Previous 7 Days';
    } else {
      label = 'Older';
    }

    if (!groups[label]) {
      groups[label] = [];
    }
    groups[label].push(session);
  });

  return groups;
}

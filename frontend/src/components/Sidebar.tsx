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
  CreditCard
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
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
}

export function Sidebar({
  isOpen,
  onToggle,
  sessions,
  currentSessionId,
  onNewChat,
  onSelectSession,
  theme,
  onToggleTheme,
}: SidebarProps) {
  // Group sessions by date
  const groupedSessions = groupSessionsByDate(sessions);

  return (
    <TooltipProvider>
      <div
        className={cn(
          "flex h-full flex-col border-r bg-sidebar text-sidebar-foreground transition-all duration-300",
          isOpen ? "w-64" : "w-16"
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-3">
          {isOpen && (
            <div className="flex items-center gap-2">
              <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <CreditCard className="size-4" />
              </div>
              <span className="font-semibold">NBFC Loans</span>
            </div>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={onToggle}
                className={cn(!isOpen && "mx-auto")}
              >
                {isOpen ? <PanelLeftClose className="size-5" /> : <PanelLeft className="size-5" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">
              {isOpen ? 'Collapse sidebar' : 'Expand sidebar'}
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
                variant="outline"
                className={cn(
                  "w-full justify-start gap-2 transition-all",
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
        <ScrollArea className="flex-1 px-3">
          {isOpen && sessions.length > 0 && (
            <div className="space-y-4 py-2">
              {Object.entries(groupedSessions).map(([label, groupSessions]) => (
                <div key={label}>
                  <p className="mb-2 px-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    {label}
                  </p>
                  <div className="space-y-1">
                    {groupSessions.map((session) => (
                      <Button
                        key={session.id}
                        variant={session.id === currentSessionId ? "secondary" : "ghost"}
                        onClick={() => onSelectSession(session)}
                        className="group w-full justify-start gap-2 text-left"
                      >
                        <MessageSquare className="size-4 shrink-0" />
                        <span className="flex-1 truncate text-sm">
                          {session.title}
                        </span>
                        <Trash2 className="size-4 shrink-0 opacity-0 transition-opacity group-hover:opacity-100 text-destructive" />
                      </Button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {isOpen && sessions.length === 0 && (
            <div className="py-8 text-center text-sm text-muted-foreground">
              <MessageSquare className="mx-auto mb-2 size-8 opacity-50" />
              <p>No chat history yet</p>
            </div>
          )}

          {!isOpen && sessions.length > 0 && (
            <div className="space-y-1 py-2">
              {sessions.slice(0, 5).map((session) => (
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
        </ScrollArea>

        <Separator />

        {/* Footer */}
        <div className="p-3">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size={isOpen ? "default" : "icon"}
                onClick={onToggleTheme}
                className={cn(
                  "w-full gap-2",
                  isOpen ? "justify-start" : "justify-center"
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
      label = 'Last 7 Days';
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

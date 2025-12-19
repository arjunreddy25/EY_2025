import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import {
    CheckCircle2,
    Clock,
    AlertTriangle,
    XCircle,
    Calculator,
    UserCheck,
    FileCheck,
    FileText,
    ArrowRight,
    Activity
} from 'lucide-react';
import type { AgentDecision } from '@/hooks/useChat';

interface AgentActivityDialogProps {
    isOpen: boolean;
    onClose: () => void;
    decisions: AgentDecision[];
}

// Agent workflow order for visualization
const AGENT_ORDER = ['Sales Agent', 'Verification Agent', 'Underwriting Agent', 'Sanction Agent'];

// Map decision types to icons and colors
const getDecisionStyle = (decisionType: string) => {
    switch (decisionType) {
        case 'EMI_CALCULATED':
            return { icon: Calculator, color: 'text-blue-500', bg: 'bg-blue-500/10', border: 'border-blue-500/30' };
        case 'KYC_VERIFIED':
            return { icon: UserCheck, color: 'text-green-500', bg: 'bg-green-500/10', border: 'border-green-500/30' };
        case 'KYC_FAILED':
            return { icon: XCircle, color: 'text-red-500', bg: 'bg-red-500/10', border: 'border-red-500/30' };
        case 'APPROVED':
            return { icon: CheckCircle2, color: 'text-green-500', bg: 'bg-green-500/10', border: 'border-green-500/30' };
        case 'CONDITIONAL':
            return { icon: AlertTriangle, color: 'text-amber-500', bg: 'bg-amber-500/10', border: 'border-amber-500/30' };
        case 'REJECTED':
            return { icon: XCircle, color: 'text-red-500', bg: 'bg-red-500/10', border: 'border-red-500/30' };
        case 'SANCTION_GENERATED':
            return { icon: FileCheck, color: 'text-emerald-500', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30' };
        default:
            return { icon: FileText, color: 'text-muted-foreground', bg: 'bg-muted', border: 'border-border' };
    }
};

// Get agent avatar colors
const getAgentColor = (agent: string) => {
    switch (agent) {
        case 'Sales Agent':
            return 'bg-blue-500';
        case 'Verification Agent':
            return 'bg-purple-500';
        case 'Underwriting Agent':
            return 'bg-amber-500';
        case 'Sanction Agent':
            return 'bg-emerald-500';
        default:
            return 'bg-muted-foreground';
    }
};

export function AgentActivityDialog({ isOpen, onClose, decisions }: AgentActivityDialogProps) {
    // Get active agents based on decisions
    const activeAgents = [...new Set(decisions.map(d => d.agent))];

    const formatTime = (date: Date) => {
        return date.toLocaleTimeString('en-IN', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
    };

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="sm:max-w-2xl max-h-[85vh] p-0 gap-0 overflow-hidden">
                <DialogHeader className="p-6 pb-4 border-b">
                    <div className="flex items-center gap-3">
                        <div className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                            <Activity className="size-5" />
                        </div>
                        <div>
                            <DialogTitle className="text-xl">Agent Activity</DialogTitle>
                            <DialogDescription>
                                Real-time workflow decisions and agent interactions
                            </DialogDescription>
                        </div>
                    </div>
                </DialogHeader>

                {/* Agent Workflow Progress Bar */}
                <div className="px-6 py-4 border-b bg-muted/30">
                    <div className="flex items-center justify-between gap-2">
                        {AGENT_ORDER.map((agent, index) => {
                            const isActive = activeAgents.includes(agent);
                            const agentDecision = decisions.filter(d => d.agent === agent).pop();
                            const hasError = agentDecision?.decisionType === 'REJECTED' || agentDecision?.decisionType === 'KYC_FAILED';

                            return (
                                <div key={agent} className="flex items-center flex-1">
                                    <div className="flex flex-col items-center flex-1">
                                        <div className={cn(
                                            "size-3 rounded-full transition-all",
                                            isActive
                                                ? hasError
                                                    ? "bg-red-500"
                                                    : getAgentColor(agent)
                                                : "bg-muted-foreground/30"
                                        )} />
                                        <span className={cn(
                                            "text-xs mt-1.5 text-center",
                                            isActive ? "text-foreground font-medium" : "text-muted-foreground"
                                        )}>
                                            {agent.replace(' Agent', '')}
                                        </span>
                                    </div>
                                    {index < AGENT_ORDER.length - 1 && (
                                        <ArrowRight className={cn(
                                            "size-4 mx-1 mt-[-1rem]",
                                            activeAgents.includes(AGENT_ORDER[index + 1])
                                                ? "text-primary"
                                                : "text-muted-foreground/30"
                                        )} />
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Decision Timeline */}
                <ScrollArea className="flex-1 max-h-[50vh]">
                    <div className="p-6">
                        {decisions.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-12 text-center">
                                <Clock className="size-12 text-muted-foreground/30 mb-4" />
                                <h3 className="text-lg font-medium text-muted-foreground mb-1">No Activity Yet</h3>
                                <p className="text-sm text-muted-foreground/70 max-w-sm">
                                    Agent decisions will appear here as you interact with the loan assistant.
                                </p>
                            </div>
                        ) : (
                            <div className="relative">
                                {/* Timeline line */}
                                <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-border" />

                                {/* Decision nodes */}
                                <div className="space-y-4">
                                    {decisions.map((decision) => {
                                        const style = getDecisionStyle(decision.decisionType);
                                        const Icon = style.icon;

                                        return (
                                            <div key={decision.id} className="relative pl-10">
                                                {/* Timeline dot */}
                                                <div className={cn(
                                                    "absolute left-0 size-8 rounded-full flex items-center justify-center",
                                                    style.bg,
                                                    style.border,
                                                    "border"
                                                )}>
                                                    <Icon className={cn("size-4", style.color)} />
                                                </div>

                                                {/* Decision card */}
                                                <div className={cn(
                                                    "p-4 rounded-lg border transition-all hover:shadow-sm",
                                                    style.bg,
                                                    style.border
                                                )}>
                                                    <div className="flex items-start justify-between gap-2 mb-2">
                                                        <div>
                                                            <span className={cn(
                                                                "text-xs font-semibold px-2 py-0.5 rounded-full",
                                                                getAgentColor(decision.agent),
                                                                "text-white"
                                                            )}>
                                                                {decision.agent}
                                                            </span>
                                                        </div>
                                                        <span className="text-xs text-muted-foreground">
                                                            {formatTime(decision.timestamp)}
                                                        </span>
                                                    </div>

                                                    <h4 className="font-medium text-sm mb-1">
                                                        {decision.summary}
                                                    </h4>
                                                    <p className="text-xs text-muted-foreground">
                                                        {decision.details}
                                                    </p>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </div>
                </ScrollArea>

                {/* Footer with stats */}
                {decisions.length > 0 && (
                    <div className="px-6 py-3 border-t bg-muted/30 flex items-center justify-between text-xs text-muted-foreground">
                        <span>{decisions.length} decision{decisions.length !== 1 ? 's' : ''} recorded</span>
                        <span>{activeAgents.length} of {AGENT_ORDER.length} agents active</span>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}

/**
 * React Query hooks for chat operations.
 * Provides queries and mutations with optimistic updates.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
    fetchSessions,
    fetchSession,
    createSession,
    deleteSession,
    saveMessage,
    generateTitle,
    addStoredSessionId,
    type ChatSession,
    type ToolCallData,
} from '@/api/chatApi';

// Query keys
export const chatKeys = {
    all: ['chat'] as const,
    sessions: () => [...chatKeys.all, 'sessions'] as const,
    session: (id: string) => [...chatKeys.all, 'session', id] as const,
};

/**
 * Hook to fetch all chat sessions
 */
export function useSessions() {
    return useQuery({
        queryKey: chatKeys.sessions(),
        queryFn: fetchSessions,
        select: (data) =>
            data.map((s) => ({
                id: s.session_id || s.id,
                title: s.title,
                createdAt: s.created_at ? new Date(s.created_at) : new Date(),
                updatedAt: s.updated_at ? new Date(s.updated_at) : undefined,
                messageCount: s.message_count,
                lastMessagePreview: s.last_message_preview,
            })),
    });
}

/**
 * Hook to fetch a single session with messages
 */
export function useSession(sessionId: string | null) {
    return useQuery({
        queryKey: chatKeys.session(sessionId || ''),
        queryFn: () => (sessionId ? fetchSession(sessionId) : null),
        enabled: !!sessionId,
        select: (data) => {
            if (!data) return null;
            return {
                id: data.session_id || data.id,
                title: data.title,
                createdAt: data.created_at ? new Date(data.created_at) : new Date(),
                messages:
                    data.messages?.map((m) => ({
                        id: m.id || `msg_${Date.now()}`,
                        role: m.role,
                        content: m.content,
                        timestamp: m.created_at ? new Date(m.created_at) : new Date(),
                        toolCalls: m.tool_calls,
                    })) || [],
            };
        },
    });
}

/**
 * Mutation to create a new session with optimistic update
 */
export function useCreateSession() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ sessionId, title }: { sessionId: string; title?: string }) =>
            createSession(sessionId, title),
        onMutate: async ({ sessionId, title }) => {
            // Cancel outgoing refetches
            await queryClient.cancelQueries({ queryKey: chatKeys.sessions() });

            // Snapshot previous value
            const previousSessions = queryClient.getQueryData(chatKeys.sessions());

            // Optimistically add new session to top of list (before select transform)
            queryClient.setQueryData(chatKeys.sessions(), (old: ChatSession[] | undefined) => {
                const newSession = {
                    session_id: sessionId,
                    id: sessionId,
                    title: title || 'New Chat',
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                    message_count: 0,
                };
                return old ? [newSession, ...old] : [newSession];
            });

            return { previousSessions };
        },
        onError: (_, __, context) => {
            // Rollback on error
            if (context?.previousSessions) {
                queryClient.setQueryData(chatKeys.sessions(), context.previousSessions);
            }
        },
        onSuccess: (_, { sessionId }) => {
            // Add to localStorage
            addStoredSessionId(sessionId);
            // Refetch to ensure consistency
            queryClient.invalidateQueries({ queryKey: chatKeys.sessions() });
        },
    });
}

/**
 * Mutation to delete a session with optimistic update
 */
export function useDeleteSession() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: deleteSession,
        onMutate: async (sessionId) => {
            // Cancel outgoing refetches
            await queryClient.cancelQueries({ queryKey: chatKeys.sessions() });

            // Snapshot previous value
            const previousSessions = queryClient.getQueryData(chatKeys.sessions());

            // Optimistically remove from cache
            queryClient.setQueryData(chatKeys.sessions(), (old: ChatSession[] | undefined) =>
                old?.filter((s) => (s.session_id || s.id) !== sessionId) || []
            );

            return { previousSessions };
        },
        onError: (_, __, context) => {
            // Rollback on error
            if (context?.previousSessions) {
                queryClient.setQueryData(chatKeys.sessions(), context.previousSessions);
            }
        },
        onSettled: () => {
            // Refetch to ensure consistency
            queryClient.invalidateQueries({ queryKey: chatKeys.sessions() });
        },
    });
}

/**
 * Mutation to save a message
 */
export function useSaveMessage() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({
            sessionId,
            role,
            content,
            toolCalls,
        }: {
            sessionId: string;
            role: 'user' | 'assistant';
            content: string;
            toolCalls?: ToolCallData[];
        }) => saveMessage(sessionId, role, content, toolCalls),
        onSuccess: (_, { sessionId }) => {
            // Invalidate the specific session to refetch messages
            queryClient.invalidateQueries({ queryKey: chatKeys.session(sessionId) });
        },
    });
}

/**
 * Mutation to generate AI title
 */
export function useGenerateTitle() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ sessionId, message }: { sessionId: string; message: string }) =>
            generateTitle(sessionId, message),
        onSuccess: (data, { sessionId }) => {
            // Update the session title in cache
            queryClient.setQueryData(chatKeys.sessions(), (old: ChatSession[] | undefined) =>
                old?.map((s) =>
                    (s.session_id || s.id) === sessionId ? { ...s, title: data.title } : s
                ) || []
            );
        },
    });
}

// ============================================
// Customer Loans & Documents Queries
// ============================================

import {
    fetchCustomerLoans,
    fetchCustomerDocuments,
    getCurrentCustomerId,
    type LoanApplication,
    type CustomerDocuments,
} from '@/api/chatApi';

// Query keys for loans
export const loanKeys = {
    all: ['loans'] as const,
    customer: (customerId: string) => [...loanKeys.all, 'customer', customerId] as const,
    documents: (customerId: string) => [...loanKeys.all, 'documents', customerId] as const,
};

/**
 * Hook to fetch customer loans
 */
export function useCustomerLoans(customerId: string | null) {
    return useQuery({
        queryKey: loanKeys.customer(customerId || ''),
        queryFn: () => (customerId ? fetchCustomerLoans(customerId) : null),
        enabled: !!customerId,
        select: (data) => {
            if (!data) return null;
            return {
                customerName: data.customer_name,
                loans: data.loans.map((loan: LoanApplication) => ({
                    ...loan,
                    createdAt: loan.created_at ? new Date(loan.created_at) : new Date(),
                })),
                totalLoans: data.total_loans,
            };
        },
    });
}

/**
 * Hook to fetch customer documents (salary slips + sanction letters)
 */
export function useCustomerDocuments(customerId: string | null) {
    return useQuery({
        queryKey: loanKeys.documents(customerId || ''),
        queryFn: () => (customerId ? fetchCustomerDocuments(customerId) : null),
        enabled: !!customerId,
        select: (data) => {
            if (!data) return null;
            return {
                customerName: data.customer_name,
                documents: data.documents as CustomerDocuments,
            };
        },
    });
}

/**
 * Helper hook to get current customer ID from localStorage
 */
export function useCurrentCustomerId(): string | null {
    return getCurrentCustomerId();
}

/**
 * Centralized API functions for chat operations.
 * Used by React Query hooks.
 */

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export interface ChatSession {
  id: string;
  session_id?: string;
  title: string;
  created_at?: string;
  updated_at?: string;
  message_count?: number;
  last_message_preview?: string;
  messages?: ChatMessage[];
}

export interface ChatMessage {
  id?: string;
  role: 'user' | 'assistant';
  content: string;
  created_at?: string;
  tool_calls?: ToolCallData[];
}

export interface ToolCallData {
  tool: string;
  agent?: string;
  status: 'started' | 'completed';
  result?: string;
}

// Helper to get customer info from localStorage
function getCustomerInfo(): { customer_id: string; name?: string } | null {
  try {
    const customerStr = localStorage.getItem('customer');
    if (customerStr) {
      return JSON.parse(customerStr);
    }
  } catch {
    // Ignore
  }
  return null;
}

// Helper to get/set anonymous session IDs in localStorage
export function getStoredSessionIds(): string[] {
  try {
    const ids = localStorage.getItem('chat_session_ids');
    return ids ? JSON.parse(ids) : [];
  } catch {
    return [];
  }
}

export function addStoredSessionId(sessionId: string): void {
  const ids = getStoredSessionIds();
  if (!ids.includes(sessionId)) {
    ids.unshift(sessionId);
    localStorage.setItem('chat_session_ids', JSON.stringify(ids.slice(0, 50)));
  }
}

export function removeStoredSessionId(sessionId: string): void {
  const ids = getStoredSessionIds().filter(id => id !== sessionId);
  localStorage.setItem('chat_session_ids', JSON.stringify(ids));
}

/**
 * Fetch all sessions for the current user (or by localStorage IDs for anonymous users)
 */
export async function fetchSessions(): Promise<ChatSession[]> {
  const customer = getCustomerInfo();

  if (customer?.customer_id) {
    // Logged-in user: fetch by customer_id
    const res = await fetch(`${API_BASE}/chat/sessions?customer_id=${customer.customer_id}`);
    if (!res.ok) throw new Error('Failed to fetch sessions');
    return res.json();
  } else {
    // Anonymous user: fetch by stored session IDs
    const storedIds = getStoredSessionIds();
    if (storedIds.length === 0) return [];

    const res = await fetch(`${API_BASE}/chat/sessions/by-ids`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_ids: storedIds }),
    });
    if (!res.ok) throw new Error('Failed to fetch sessions');
    return res.json();
  }
}

/**
 * Fetch a single session with all its messages
 */
export async function fetchSession(sessionId: string): Promise<ChatSession | null> {
  const res = await fetch(`${API_BASE}/chat/sessions/${sessionId}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error('Failed to fetch session');
  return res.json();
}

/**
 * Create a new chat session
 */
export async function createSession(sessionId: string, title: string = 'New Chat'): Promise<ChatSession> {
  const customer = getCustomerInfo();

  const res = await fetch(`${API_BASE}/chat/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      session_id: sessionId,
      customer_id: customer?.customer_id || null,
      title,
    }),
  });

  if (!res.ok) throw new Error('Failed to create session');
  
  // Add to localStorage for anonymous users
  addStoredSessionId(sessionId);
  
  return res.json();
}

/**
 * Delete a chat session
 */
export async function deleteSession(sessionId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/chat/sessions/${sessionId}`, {
    method: 'DELETE',
  });

  if (!res.ok) throw new Error('Failed to delete session');
  
  // Remove from localStorage
  removeStoredSessionId(sessionId);
}

/**
 * Save a message to a session
 */
export async function saveMessage(
  sessionId: string,
  role: 'user' | 'assistant',
  content: string,
  toolCalls?: ToolCallData[]
): Promise<ChatMessage> {
  const res = await fetch(`${API_BASE}/chat/sessions/${sessionId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      role,
      content,
      tool_calls: toolCalls || null,
    }),
  });

  if (!res.ok) throw new Error('Failed to save message');
  return res.json();
}

/**
 * Generate AI title for a session based on first message
 */
export async function generateTitle(sessionId: string, message: string): Promise<{ title: string }> {
  const res = await fetch(`${API_BASE}/chat/sessions/${sessionId}/generate-title`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
  });

  if (!res.ok) throw new Error('Failed to generate title');
  return res.json();
}

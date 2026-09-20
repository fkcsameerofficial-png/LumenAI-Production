import { create } from "zustand";
import { api } from "../api/client";
import { streamMessage } from "../api/stream";

export interface Attachment {
  fileId: string;
  filename: string;
  kind: "image" | "text" | "file";
}

export interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  attachments?: Attachment[];
  error?: string | null;
  pending?: boolean;
}

export interface Conversation {
  id: string;
  title: string;
  provider: string;
  model: string;
  system_prompt: string;
  pinned: number;
  created_at: string;
  updated_at: string;
}

interface ChatState {
  conversations: Conversation[];
  activeId: string | null;
  messages: Message[];
  isStreaming: boolean;
  loadingConversations: boolean;
  loadingMessages: boolean;
  abortStream: (() => void) | null;

  loadConversations: (q?: string) => Promise<void>;
  createConversation: (provider: string, model: string) => Promise<Conversation>;
  selectConversation: (id: string) => Promise<void>;
  renameConversation: (id: string, title: string) => Promise<void>;
  togglePin: (id: string) => Promise<void>;
  updateConversationSettings: (
    id: string,
    fields: Partial<Pick<Conversation, "provider" | "model" | "system_prompt">>
  ) => Promise<void>;
  deleteConversation: (id: string) => Promise<void>;
  sendMessage: (content: string, attachmentIds?: string[]) => Promise<void>;
  stopStreaming: () => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  conversations: [],
  activeId: null,
  messages: [],
  isStreaming: false,
  loadingConversations: false,
  loadingMessages: false,
  abortStream: null,

  loadConversations: async (q) => {
    set({ loadingConversations: true });
    try {
      const query = q ? `?q=${encodeURIComponent(q)}` : "";
      const data = await api.get<{ conversations: Conversation[] }>(`/api/conversations${query}`);
      set({ conversations: data.conversations });
    } finally {
      set({ loadingConversations: false });
    }
  },

  createConversation: async (provider, model) => {
    const data = await api.post<{ conversation: Conversation }>("/api/conversations", { provider, model });
    set((s) => ({ conversations: [data.conversation, ...s.conversations] }));
    return data.conversation;
  },

  selectConversation: async (id) => {
    set({ loadingMessages: true, activeId: id });
    try {
      const data = await api.get<{ conversation: Conversation; messages: Message[] }>(
        `/api/conversations/${id}`
      );
      set({ messages: data.messages, activeId: id });
    } finally {
      set({ loadingMessages: false });
    }
  },

  renameConversation: async (id, title) => {
    await api.patch(`/api/conversations/${id}`, { title });
    set((s) => ({
      conversations: s.conversations.map((c) => (c.id === id ? { ...c, title } : c)),
    }));
  },

  togglePin: async (id) => {
    const conv = get().conversations.find((c) => c.id === id);
    if (!conv) return;
    const pinned = conv.pinned ? false : true;
    await api.patch(`/api/conversations/${id}`, { pinned });
    set((s) => ({
      conversations: s.conversations
        .map((c) => (c.id === id ? { ...c, pinned: pinned ? 1 : 0 } : c))
        .sort((a, b) => (b.pinned - a.pinned) || (a.updated_at < b.updated_at ? 1 : -1)),
    }));
  },

  updateConversationSettings: async (id, fields) => {
    const body: any = {};
    if (fields.provider !== undefined) body.provider = fields.provider;
    if (fields.model !== undefined) body.model = fields.model;
    if (fields.system_prompt !== undefined) body.systemPrompt = fields.system_prompt;
    await api.patch(`/api/conversations/${id}`, body);
    set((s) => ({
      conversations: s.conversations.map((c) => (c.id === id ? { ...c, ...fields } : c)),
    }));
  },

  deleteConversation: async (id) => {
    await api.del(`/api/conversations/${id}`);
    set((s) => ({
      conversations: s.conversations.filter((c) => c.id !== id),
      activeId: s.activeId === id ? null : s.activeId,
      messages: s.activeId === id ? [] : s.messages,
    }));
  },

  sendMessage: async (content, attachmentIds) => {
    const { activeId } = get();
    if (!activeId) return;

    const optimisticUserMsg: Message = { id: `pending-user-${Date.now()}`, role: "user", content };
    const pendingAssistant: Message = { id: `pending-assistant-${Date.now()}`, role: "assistant", content: "", pending: true };
    set((s) => ({ messages: [...s.messages, optimisticUserMsg, pendingAssistant], isStreaming: true }));

    const { abort, done } = streamMessage(activeId, { content, attachmentIds }, (event) => {
      if (event.type === "token") {
        set((s) => ({
          messages: s.messages.map((m) =>
            m.id === pendingAssistant.id ? { ...m, content: m.content + event.text } : m
          ),
        }));
      } else if (event.type === "error") {
        set((s) => ({
          messages: s.messages.map((m) =>
            m.id === pendingAssistant.id ? { ...m, error: event.message, pending: false } : m
          ),
        }));
      } else if (event.type === "done") {
        set((s) => ({
          messages: s.messages.map((m) =>
            m.id === pendingAssistant.id ? { ...m, id: event.messageId, pending: false } : m
          ),
        }));
      }
    });

    set({ abortStream: abort });
    await done;
    set({ isStreaming: false, abortStream: null });
    // Refresh conversation list so title/ordering (updated_at) stays in sync.
    get().loadConversations();
  },

  stopStreaming: () => {
    get().abortStream?.();
    set({ isStreaming: false, abortStream: null });
  },
}));

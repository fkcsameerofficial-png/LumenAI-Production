import React, { useEffect, useState } from "react";
import { useChatStore } from "../store/chatStore";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { useNavigate } from "react-router-dom";

export function Sidebar({
  onOpenSettings,
  onClose,
}: {
  onOpenSettings: () => void;
  onClose?: () => void;
}) {
  const {
    conversations,
    activeId,
    loadConversations,
    createConversation,
    selectConversation,
    renameConversation,
    deleteConversation,
    togglePin,
  } = useChatStore();
  const { user, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const navigate = useNavigate();

  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  useEffect(() => {
    const handle = setTimeout(() => loadConversations(search), 250);
    return () => clearTimeout(handle);
  }, [search, loadConversations]);

  const handleNewChat = async () => {
    const conv = await createConversation("openai", "gpt-4o-mini");
    await selectConversation(conv.id);
    onClose?.();
  };

  const commitRename = (id: string) => {
    if (editingTitle.trim()) renameConversation(id, editingTitle.trim());
    setEditingId(null);
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800">
      <div className="p-3 space-y-2">
        <button
          onClick={handleNewChat}
          className="w-full flex items-center justify-center gap-2 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium py-2.5 transition-colors"
        >
          + New chat
        </button>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search conversations..."
          className="w-full text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
      </div>

      <div className="flex-1 overflow-y-auto px-2 space-y-0.5">
        {conversations.map((c) => (
          <div
            key={c.id}
            className={`group flex items-center gap-1 rounded-lg px-2 py-2 cursor-pointer text-sm ${
              activeId === c.id
                ? "bg-brand-100 dark:bg-brand-900/40 text-brand-800 dark:text-brand-200"
                : "hover:bg-slate-200/60 dark:hover:bg-slate-800/60"
            }`}
            onClick={() => {
              if (editingId !== c.id) {
                selectConversation(c.id);
                onClose?.();
              }
            }}
          >
            {c.pinned ? <span title="Pinned">📌</span> : null}
            {editingId === c.id ? (
              <input
                autoFocus
                value={editingTitle}
                onChange={(e) => setEditingTitle(e.target.value)}
                onBlur={() => commitRename(c.id)}
                onKeyDown={(e) => e.key === "Enter" && commitRename(c.id)}
                onClick={(e) => e.stopPropagation()}
                className="flex-1 bg-transparent border-b border-brand-400 focus:outline-none"
              />
            ) : (
              <span className="flex-1 truncate">{c.title}</span>
            )}

            <div className="hidden group-hover:flex items-center gap-1 shrink-0">
              <button
                title="Pin"
                onClick={(e) => {
                  e.stopPropagation();
                  togglePin(c.id);
                }}
                className="p-1 rounded hover:bg-slate-300/60 dark:hover:bg-slate-700"
              >
                📌
              </button>
              <button
                title="Rename"
                onClick={(e) => {
                  e.stopPropagation();
                  setEditingId(c.id);
                  setEditingTitle(c.title);
                }}
                className="p-1 rounded hover:bg-slate-300/60 dark:hover:bg-slate-700"
              >
                ✏️
              </button>
              <button
                title="Delete"
                onClick={(e) => {
                  e.stopPropagation();
                  if (confirm(`Delete "${c.title}"? This cannot be undone.`)) deleteConversation(c.id);
                }}
                className="p-1 rounded hover:bg-red-200 dark:hover:bg-red-900/50"
              >
                🗑️
              </button>
            </div>
          </div>
        ))}
        {conversations.length === 0 && (
          <p className="text-xs text-slate-400 text-center mt-6 px-4">
            No conversations yet — start a new chat to begin.
          </p>
        )}
      </div>

      <div className="p-3 border-t border-slate-200 dark:border-slate-800 space-y-2">
        <button
          onClick={() => navigate("/projects")}
          className="w-full text-left text-sm rounded-lg px-3 py-2 hover:bg-slate-200/60 dark:hover:bg-slate-800/60"
        >
          🛠️ Projects & Agent
        </button>
        <button
          onClick={toggle}
          className="w-full flex items-center justify-between text-sm rounded-lg px-3 py-2 hover:bg-slate-200/60 dark:hover:bg-slate-800/60"
        >
          <span>{theme === "dark" ? "🌙 Dark mode" : "☀️ Light mode"}</span>
          <span className="text-xs text-slate-400">tap to toggle</span>
        </button>
        <button
          onClick={onOpenSettings}
          className="w-full text-left text-sm rounded-lg px-3 py-2 hover:bg-slate-200/60 dark:hover:bg-slate-800/60"
        >
          ⚙️ Settings
        </button>
        <div className="flex items-center justify-between px-1">
          <span className="text-xs text-slate-500 truncate">{user?.name}</span>
          <button onClick={logout} className="text-xs text-brand-600 hover:underline">
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}

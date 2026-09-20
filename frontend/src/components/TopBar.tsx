import React, { useState } from "react";
import { useChatStore } from "../store/chatStore";
import { ModelSelector } from "./ModelSelector";

export function TopBar({ onOpenSidebar }: { onOpenSidebar: () => void }) {
  const { activeId, conversations, updateConversationSettings } = useChatStore();
  const [showSystemPrompt, setShowSystemPrompt] = useState(false);
  const conv = conversations.find((c) => c.id === activeId);

  if (!activeId || !conv) {
    return (
      <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-200 dark:border-slate-800">
        <button onClick={onOpenSidebar} className="sm:hidden text-xl">☰</button>
        <span className="font-semibold">Lumen</span>
      </div>
    );
  }

  return (
    <div className="border-b border-slate-200 dark:border-slate-800">
      <div className="flex items-center gap-2 px-3 sm:px-4 py-2.5">
        <button onClick={onOpenSidebar} className="sm:hidden text-xl">☰</button>
        <span className="font-medium truncate flex-1">{conv.title}</span>
        <ModelSelector conversationId={activeId} />
        <button
          onClick={() => setShowSystemPrompt((v) => !v)}
          title="System prompt"
          className="text-sm px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          🧭
        </button>
      </div>
      {showSystemPrompt && (
        <div className="px-3 sm:px-4 pb-3">
          <textarea
            defaultValue={conv.system_prompt}
            placeholder="System prompt for this conversation (instructions the assistant should always follow)..."
            onBlur={(e) => updateConversationSettings(activeId, { system_prompt: e.target.value })}
            rows={3}
            className="w-full text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
      )}
    </div>
  );
}

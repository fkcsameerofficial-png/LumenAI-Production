import React, { useEffect, useRef } from "react";
import { useChatStore } from "../store/chatStore";
import { MessageBubble } from "./MessageBubble";
import { Composer } from "./Composer";
import { TopBar } from "./TopBar";

export function ChatWindow({ onOpenSidebar }: { onOpenSidebar: () => void }) {
  const { activeId, messages, loadingMessages } = useChatStore();
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <div className="flex flex-col h-full min-h-0 min-w-0 w-full">
      <TopBar onOpenSidebar={onOpenSidebar} />

      <div className="flex-1 min-h-0 min-w-0 overflow-y-auto py-4 space-y-3">
        {!activeId && (
          <div className="h-full w-full max-w-full flex flex-col items-center justify-center text-center px-4 sm:px-6 text-slate-400">
            <div className="text-4xl mb-2">✨</div>
            <p className="text-lg font-medium text-slate-600 dark:text-slate-300">Welcome to Lumen</p>
            <p className="text-sm mt-1 max-w-sm">
              Start a new chat from the sidebar, connect a provider API key in Settings, and go.
            </p>
          </div>
        )}
        {loadingMessages && <p className="text-center text-sm text-slate-400">Loading...</p>}
        {activeId &&
          !loadingMessages &&
          messages.map((m) => <MessageBubble key={m.id} message={m} />)}
        <div ref={bottomRef} />
      </div>

      {activeId && <Composer />}
    </div>
  );
}

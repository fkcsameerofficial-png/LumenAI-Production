import React from "react";
import { Message } from "../store/chatStore";
import { MarkdownRenderer } from "./MarkdownRenderer";

export function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === "user";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} px-2 sm:px-0`}>
      <div
        className={`max-w-[90%] sm:max-w-[75%] rounded-2xl px-4 py-2.5 ${
          isUser
            ? "bg-brand-600 text-white rounded-br-sm"
            : "bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-bl-sm"
        }`}
      >
        {message.attachments && message.attachments.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-1.5">
            {message.attachments.map((a) => (
              <span
                key={a.fileId}
                className={`text-xs px-2 py-0.5 rounded-full ${
                  isUser ? "bg-brand-700/60" : "bg-slate-200 dark:bg-slate-700"
                }`}
              >
                📎 {a.filename}
              </span>
            ))}
          </div>
        )}

        {message.pending && message.content === "" ? (
          <div className="flex gap-1 py-1">
            <span className="typing-dot w-1.5 h-1.5 rounded-full bg-current inline-block" />
            <span className="typing-dot w-1.5 h-1.5 rounded-full bg-current inline-block" />
            <span className="typing-dot w-1.5 h-1.5 rounded-full bg-current inline-block" />
          </div>
        ) : isUser ? (
          <p className="whitespace-pre-wrap break-words">{message.content}</p>
        ) : (
          <MarkdownRenderer content={message.content} />
        )}

        {message.error && (
          <p className="mt-1.5 text-xs text-red-500 dark:text-red-400 border-t border-red-500/20 pt-1.5">
            ⚠ {message.error}
          </p>
        )}
      </div>
    </div>
  );
}

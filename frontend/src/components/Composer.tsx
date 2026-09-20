import React, { useRef, useState } from "react";
import { api } from "../api/client";
import { useChatStore } from "../store/chatStore";

interface PendingAttachment {
  fileId: string;
  filename: string;
  kind: "image" | "text" | "file";
  uploading?: boolean;
}

export function Composer() {
  const [text, setText] = useState("");
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { sendMessage, isStreaming, stopStreaming, activeId } = useChatStore();

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    for (const file of Array.from(files)) {
      const tempId = `uploading-${Date.now()}-${file.name}`;
      setAttachments((prev) => [...prev, { fileId: tempId, filename: file.name, kind: "file", uploading: true }]);
      try {
        const form = new FormData();
        form.append("file", file);
        if (activeId) form.append("conversationId", activeId);
        const data = await api.upload<{ file: { id: string; filename: string; kind: "image" | "text" | "file" } }>(
          "/api/files",
          form
        );
        setAttachments((prev) =>
          prev.map((a) =>
            a.fileId === tempId
              ? { fileId: data.file.id, filename: data.file.filename, kind: data.file.kind }
              : a
          )
        );
      } catch (err: any) {
        setAttachments((prev) => prev.filter((a) => a.fileId !== tempId));
        alert(`Failed to upload ${file.name}: ${err.message}`);
      }
    }
  };

  const removeAttachment = (fileId: string) => setAttachments((prev) => prev.filter((a) => a.fileId !== fileId));

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed || isStreaming) return;
    if (attachments.some((a) => a.uploading)) return;
    sendMessage(trimmed, attachments.map((a) => a.fileId));
    setText("");
    setAttachments([]);
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const autoGrow = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = Math.min(e.target.scrollHeight, 200) + "px";
  };

  return (
    <div className="border-t border-slate-200 dark:border-slate-800 p-3 sm:p-4 bg-white dark:bg-slate-950">
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2">
          {attachments.map((a) => (
            <span
              key={a.fileId}
              className="text-xs flex items-center gap-1 px-2 py-1 rounded-full bg-slate-100 dark:bg-slate-800"
            >
              {a.uploading ? "⏳" : "📎"} {a.filename}
              <button onClick={() => removeAttachment(a.fileId)} className="ml-1 text-slate-400 hover:text-red-500">
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="flex items-end gap-2">
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          title="Attach a file or image"
          className="shrink-0 w-10 h-10 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        >
          📎
        </button>
        <textarea
          ref={textareaRef}
          value={text}
          onChange={autoGrow}
          onKeyDown={handleKeyDown}
          rows={1}
          placeholder="Message Lumen... (Shift+Enter for a new line)"
          className="flex-1 resize-none rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 max-h-[200px]"
        />
        {isStreaming ? (
          <button
            onClick={stopStreaming}
            className="shrink-0 h-10 px-4 rounded-xl bg-red-500 text-white text-sm font-medium hover:bg-red-600 transition-colors"
          >
            Stop
          </button>
        ) : (
          <button
            onClick={handleSend}
            disabled={!text.trim()}
            className="shrink-0 h-10 px-4 rounded-xl bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Send
          </button>
        )}
      </div>
    </div>
  );
}

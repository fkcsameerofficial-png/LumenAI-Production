import React, { useState } from "react";

interface CodeBlockProps {
  className?: string;
  children: React.ReactNode;
}

/** Renders a fenced code block with a language label and a one-click copy button. */
export function CodeBlock({ className, children }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);
  const language = /language-(\w+)/.exec(className ?? "")?.[1] ?? "text";
  const codeText = String(children).replace(/\n$/, "");

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(codeText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked; fail silently */
    }
  };

  return (
    <div className="relative group my-3 rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700">
      <div className="flex items-center justify-between px-3 py-1.5 bg-slate-100 dark:bg-slate-800 text-xs text-slate-500 dark:text-slate-400">
        <span className="font-mono">{language}</span>
        <button
          onClick={handleCopy}
          className="px-2 py-0.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
        >
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
      <pre className="!m-0 overflow-x-auto p-3 text-sm bg-slate-50 dark:bg-slate-900">
        <code className={className}>{children}</code>
      </pre>
    </div>
  );
}

import React, { useEffect, useState } from "react";
import { api } from "../api/client";
import { useChatStore } from "../store/chatStore";

interface ProviderModels {
  id: string;
  label: string;
  requiresApiKey: boolean;
  usable: boolean;
  models: { id: string; label: string; supportsImages: boolean }[];
}

export function ModelSelector({ conversationId }: { conversationId: string }) {
  const [providers, setProviders] = useState<ProviderModels[]>([]);
  const conv = useChatStore((s) => s.conversations.find((c) => c.id === conversationId));
  const updateConversationSettings = useChatStore((s) => s.updateConversationSettings);

  useEffect(() => {
    api.get<{ providers: ProviderModels[] }>("/api/models").then((d) => setProviders(d.providers));
  }, []);

  if (!conv) return null;

  const currentProvider = providers.find((p) => p.id === conv.provider);

  return (
    <div className="flex items-center gap-2">
      <select
        value={conv.provider}
        onChange={(e) => {
          const nextProvider = providers.find((p) => p.id === e.target.value);
          const nextModel = nextProvider?.models[0]?.id ?? conv.model;
          updateConversationSettings(conversationId, { provider: e.target.value, model: nextModel });
        }}
        className="text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent px-2 py-1"
      >
        {providers.map((p) => (
          <option key={p.id} value={p.id} disabled={!p.usable}>
            {p.label} {!p.usable ? "(no API key)" : ""}
          </option>
        ))}
      </select>
      <select
        value={conv.model}
        onChange={(e) => updateConversationSettings(conversationId, { model: e.target.value })}
        className="text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent px-2 py-1 max-w-[160px] sm:max-w-none"
      >
        {(currentProvider?.models ?? [{ id: conv.model, label: conv.model }]).map((m) => (
          <option key={m.id} value={m.id}>
            {m.label}
          </option>
        ))}
      </select>
    </div>
  );
}

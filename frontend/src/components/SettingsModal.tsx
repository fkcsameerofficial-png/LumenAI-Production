import React, { useEffect, useRef, useState } from "react";
import { api } from "../api/client";
import { useChatStore } from "../store/chatStore";

interface ProviderModels {
  id: string;
  label: string;
  requiresApiKey: boolean;
  usable: boolean;
}

interface StoredKey {
  id: string;
  provider: string;
  label: string;
  masked_preview: string;
}

export function SettingsModal({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<"providers" | "data">("providers");
  const [providers, setProviders] = useState<ProviderModels[]>([]);
  const [keys, setKeys] = useState<StoredKey[]>([]);
  const [keyDrafts, setKeyDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { conversations, activeId } = useChatStore();

  const refresh = async () => {
    const [modelsRes, keysRes] = await Promise.all([
      api.get<{ providers: ProviderModels[] }>("/api/models"),
      api.get<{ apiKeys: StoredKey[] }>("/api/api-keys"),
    ]);
    setProviders(modelsRes.providers);
    setKeys(keysRes.apiKeys);
  };

  useEffect(() => {
    refresh();
  }, []);

  const saveKey = async (providerId: string) => {
    const value = keyDrafts[providerId]?.trim();
    if (!value) return;
    setSaving(providerId);
    try {
      await api.put("/api/api-keys", { provider: providerId, apiKey: value, label: "Default" });
      setKeyDrafts((d) => ({ ...d, [providerId]: "" }));
      await refresh();
    } catch (err: any) {
      alert(`Failed to save key: ${err.message}`);
    } finally {
      setSaving(null);
    }
  };

  const removeKey = async (providerId: string) => {
    if (!confirm(`Remove your stored API key for ${providerId}?`)) return;
    await api.del(`/api/api-keys/${providerId}`);
    await refresh();
  };

  const exportCurrent = async () => {
    if (!activeId) return alert("Open a conversation first.");
    const data = await api.get(`/api/conversations/${activeId}/export`);
    downloadJson(data, `lumen-chat-${activeId}.json`);
  };

  const exportAll = async () => {
    const all = [];
    for (const c of conversations) {
      all.push(await api.get(`/api/conversations/${c.id}/export`));
    }
    downloadJson({ exportedFrom: "Lumen", version: 1, conversations: all }, `lumen-export-all.json`);
  };

  const handleImport = async (file: File) => {
    const text = await file.text();
    let parsed: any;
    try {
      parsed = JSON.parse(text);
    } catch {
      return alert("That file isn't valid JSON.");
    }
    const items = parsed.conversations ? parsed.conversations : [parsed];
    for (const item of items) {
      if (!item.conversation || !item.messages) continue;
      await api.post("/api/conversations/import", item);
    }
    await useChatStore.getState().loadConversations();
    alert("Import complete.");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-2xl bg-white dark:bg-slate-900 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800">
          <h2 className="font-semibold text-lg">Settings</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 text-xl leading-none">
            ×
          </button>
        </div>

        <div className="flex gap-1 px-5 pt-3">
          {(["providers", "data"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-1.5 rounded-lg text-sm ${
                tab === t ? "bg-brand-600 text-white" : "hover:bg-slate-100 dark:hover:bg-slate-800"
              }`}
            >
              {t === "providers" ? "Providers & API keys" : "Export / Import"}
            </button>
          ))}
        </div>

        <div className="p-5 space-y-5">
          {tab === "providers" && (
            <>
              <p className="text-xs text-slate-500">
                Keys are encrypted at rest and only ever used server-side to call the provider on your
                behalf. Lumen enforces no message or credit limits of its own — usage is bounded only by
                the provider you connect.
              </p>
              {providers.map((p) => {
                const stored = keys.find((k) => k.provider === p.id);
                return (
                  <div key={p.id} className="border border-slate-200 dark:border-slate-700 rounded-xl p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-sm">{p.label}</span>
                      {!p.requiresApiKey && (
                        <span className="text-xs text-green-600 dark:text-green-400">No key needed</span>
                      )}
                    </div>
                    {p.requiresApiKey && (
                      <>
                        {stored && (
                          <div className="flex items-center justify-between text-xs bg-slate-100 dark:bg-slate-800 rounded-lg px-2 py-1.5">
                            <span>Current key: {stored.masked_preview}</span>
                            <button onClick={() => removeKey(p.id)} className="text-red-500 hover:underline">
                              Remove
                            </button>
                          </div>
                        )}
                        <div className="flex gap-2">
                          <input
                            type="password"
                            placeholder={stored ? "Replace key..." : "Paste API key..."}
                            value={keyDrafts[p.id] ?? ""}
                            onChange={(e) => setKeyDrafts((d) => ({ ...d, [p.id]: e.target.value }))}
                            className="flex-1 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent px-2 py-1.5"
                          />
                          <button
                            onClick={() => saveKey(p.id)}
                            disabled={saving === p.id}
                            className="text-sm px-3 rounded-lg bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50"
                          >
                            Save
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </>
          )}

          {tab === "data" && (
            <div className="space-y-3">
              <button
                onClick={exportCurrent}
                className="w-full text-sm rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 hover:bg-slate-100 dark:hover:bg-slate-800 text-left"
              >
                ⬇ Export current conversation (.json)
              </button>
              <button
                onClick={exportAll}
                className="w-full text-sm rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 hover:bg-slate-100 dark:hover:bg-slate-800 text-left"
              >
                ⬇ Export all conversations (.json)
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/json"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && handleImport(e.target.files[0])}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full text-sm rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 hover:bg-slate-100 dark:hover:bg-slate-800 text-left"
              >
                ⬆ Import conversation(s) from .json
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function downloadJson(data: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

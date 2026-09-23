import { db } from "../db";
import { getProvider } from "../providers";
import { ChatMessage } from "../providers/base";
import { decryptSecret } from "../utils/crypto";
import { env } from "../config/env";
import { normalizeProjectPath, ownedProject, upsertProjectFile } from "./projectService";

async function resolveApiKey(userId: string, provider: string): Promise<string | null> {
  const row = await db.get<{ encrypted_key: string }>(`SELECT encrypted_key FROM api_keys WHERE user_id = ? AND provider = ?`, [userId, provider]);
  if (row) return decryptSecret(row.encrypted_key);
  if (env.allowSharedKeys) {
    if (provider === "openai" && env.openaiApiKey) return env.openaiApiKey;
    if (provider === "anthropic" && env.anthropicApiKey) return env.anthropicApiKey;
    if (provider === "gemini" && env.geminiApiKey) return env.geminiApiKey;
  }
  return null;
}

function extractJson(text: string): any {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const candidate = fenced ?? text.match(/\{[\s\S]*\}/)?.[0];
  if (!candidate) throw new Error("Agent returned no JSON tool plan");
  return JSON.parse(candidate);
}

async function event(taskId: string, type: string, message: string) {
  await db.run(`INSERT INTO agent_events (id, task_id, type, message, created_at) VALUES (?, ?, ?, ?, datetime('now'))`, [crypto.randomUUID(), taskId, type, message]);
}

export function startAgentTask(taskId: string) {
  void runAgentTask(taskId).catch(() => undefined);
}

async function runAgentTask(taskId: string) {
  const task = await db.get<any>(`SELECT * FROM agent_tasks WHERE id = ?`, [taskId]);
  if (!task) return;
  try {
    await db.run(`UPDATE agent_tasks SET status = 'running', started_at = datetime('now') WHERE id = ?`, [taskId]);
    await event(taskId, "status", "Agent started");
    const project = await ownedProject(task.project_id, task.user_id);
    const files = await db.all<any>(`SELECT path, content FROM project_files WHERE project_id = ? ORDER BY path`, [project.id]);
    const provider = getProvider(task.provider);
    if (!provider) throw new Error(`Unknown provider: ${task.provider}`);
    const apiKey = await resolveApiKey(task.user_id, task.provider);
    if (provider.requiresApiKey && !apiKey) throw new Error(`No API key configured for ${provider.label}`);

    const tree = files.map((f) => f.path).join("\n") || "(empty project)";
    const context = files.slice(0, 40).map((f) => `--- ${f.path} ---\n${f.content.slice(0, 12000)}`).join("\n\n");
    const system = `You are Lumen's coding agent. Work on the user's project safely. Return ONLY JSON, no markdown. Schema: {"summary":"...","operations":[{"type":"write_file","path":"relative/path","content":"full file content"},{"type":"delete_file","path":"relative/path"}],"done":true}. Never use absolute paths, .., shell commands, secrets, or binary data. Prefer small targeted changes. Existing project tree:\n${tree}\nCurrent files:\n${context}`;
    const messages: ChatMessage[] = [
      { role: "system", content: system },
      { role: "user", content: task.prompt },
    ];
    let output = "";
    for await (const chunk of provider.streamChat(messages, apiKey, { model: task.model })) {
      if (chunk.type === "token") output += chunk.text ?? "";
      if (chunk.type === "error") throw new Error(chunk.message ?? "Provider error");
    }
    const plan = extractJson(output);
    if (!Array.isArray(plan.operations)) throw new Error("Invalid agent plan: operations missing");
    let changed = 0;
    for (const op of plan.operations.slice(0, 30)) {
      if (op.type === "write_file") {
        await upsertProjectFile(project.id, op.path, String(op.content ?? ""));
        changed++;
        await event(taskId, "file", `Updated ${normalizeProjectPath(op.path)}`);
      } else if (op.type === "delete_file") {
        const path = normalizeProjectPath(op.path);
        await db.run(`DELETE FROM project_files WHERE project_id = ? AND path = ?`, [project.id, path]);
        changed++;
        await event(taskId, "file", `Deleted ${path}`);
      }
    }
    const result = String(plan.summary ?? `Agent completed ${changed} file change(s).`);
    await db.run(`UPDATE agent_tasks SET status = 'completed', result = ?, finished_at = datetime('now') WHERE id = ?`, [result, taskId]);
    await event(taskId, "done", result);
  } catch (err: any) {
    const message = err?.message ?? "Agent task failed";
    await db.run(`UPDATE agent_tasks SET status = 'failed', error = ?, finished_at = datetime('now') WHERE id = ?`, [message, taskId]);
    await event(taskId, "error", message);
  }
}

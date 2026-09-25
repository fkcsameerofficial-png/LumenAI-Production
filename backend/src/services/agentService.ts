import fs from "fs/promises";
import os from "os";
import path from "path";
import { spawn } from "child_process";
import { db } from "../db";
import { getProvider } from "../providers";
import { ChatMessage } from "../providers/base";
import { decryptSecret } from "../utils/crypto";
import { env } from "../config/env";
import { normalizeProjectPath, ownedProject, upsertProjectFile } from "./projectService";

const MAX_OPERATIONS_PER_ITERATION = 30;
const MAX_CONTEXT_FILES = 12;
const MAX_CONTEXT_FILE_CHARS = 8000;
const activeTasks = new Set<string>();

interface AgentOperation {
  type: "create_file" | "write_file" | "update_file" | "delete_file";
  path: string;
  content?: string;
}

interface AgentPlan {
  summary?: string;
  plan?: string;
  operations?: AgentOperation[];
  files?: string[];
  needed_files?: string[];
  done?: boolean;
}

interface ValidationResult {
  supported: boolean;
  passed: boolean;
  command?: string;
  output: string;
}

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

function extractJson(text: string): AgentPlan {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const candidate = fenced ?? text.match(/\{[\s\S]*\}/)?.[0];
  if (!candidate) throw new Error("Agent returned no JSON decision");
  const parsed = JSON.parse(candidate) as AgentPlan;
  if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.operations)) {
    throw new Error("Agent returned an invalid decision: operations missing");
  }
  return parsed;
}

async function event(taskId: string, type: string, message: string) {
  await db.run(`INSERT INTO agent_events (id, task_id, type, message, created_at) VALUES (?, ?, ?, ?, datetime('now'))`, [crypto.randomUUID(), taskId, type, message]);
}

async function updateTask(taskId: string, values: { iteration?: number; result?: string; changedFiles?: string[] }) {
  const assignments: string[] = [];
  const params: unknown[] = [];
  if (values.iteration !== undefined) {
    assignments.push("iteration = ?");
    params.push(values.iteration);
  }
  if (values.result !== undefined) {
    assignments.push("result = ?");
    params.push(values.result);
  }
  if (values.changedFiles !== undefined) {
    assignments.push("changed_files = ?");
    params.push(JSON.stringify(values.changedFiles));
  }
  if (assignments.length) {
    params.push(taskId);
    await db.run(`UPDATE agent_tasks SET ${assignments.join(", ")} WHERE id = ?`, params);
  }
}

async function loadFiles(projectId: string): Promise<Array<{ path: string; content: string }>> {
  return db.all(`SELECT path, content FROM project_files WHERE project_id = ? ORDER BY path`, [projectId]);
}

function compactContext(files: Array<{ path: string; content: string }>, requested: Set<string>, changed: Set<string>) {
  const selected = files
    .filter((file) => requested.has(file.path) || changed.has(file.path) || /(^|\/)(package\.json|tsconfig[^/]*|vite\.config[^/]*|README[^/]*)$/i.test(file.path))
    .slice(0, MAX_CONTEXT_FILES);
  const fallback = selected.length ? selected : files.slice(0, MAX_CONTEXT_FILES);
  return fallback.map((file) => `--- ${file.path} ---\n${file.content.slice(0, MAX_CONTEXT_FILE_CHARS)}`).join("\n\n") || "(empty project)";
}

function projectTree(files: Array<{ path: string; content: string }>) {
  return files.map((file) => file.path).join("\n") || "(empty project)";
}

async function streamDecision(task: any, system: string, provider: any, apiKey: string | null) {
  const messages: ChatMessage[] = [
    { role: "system", content: system },
    { role: "user", content: task.prompt },
  ];
  let output = "";
  for await (const chunk of provider.streamChat(messages, apiKey, { model: task.model })) {
    if (chunk.type === "token") output += chunk.text ?? "";
    if (chunk.type === "error") throw new Error(chunk.message ?? "Provider error");
  }
  return extractJson(output);
}

async function applyOperations(projectId: string, operations: AgentOperation[], taskId: string, changed: Set<string>) {
  let count = 0;
  for (const operation of operations.slice(0, MAX_OPERATIONS_PER_ITERATION)) {
    if (!operation || typeof operation.path !== "string") throw new Error("Agent returned an operation without a valid path");
    const normalizedPath = normalizeProjectPath(operation.path);
    if (["create_file", "write_file", "update_file"].includes(operation.type)) {
      if (typeof operation.content !== "string") throw new Error(`Agent did not provide content for ${normalizedPath}`);
      await upsertProjectFile(projectId, normalizedPath, operation.content);
      changed.add(normalizedPath);
      count++;
      await event(taskId, "file", `Updated ${normalizedPath}`);
    } else if (operation.type === "delete_file") {
      await db.run(`DELETE FROM project_files WHERE project_id = ? AND path = ?`, [projectId, normalizedPath]);
      changed.add(normalizedPath);
      count++;
      await event(taskId, "file", `Deleted ${normalizedPath}`);
    } else {
      throw new Error(`Agent returned unsupported operation: ${String(operation.type)}`);
    }
  }
  if (count) await db.run(`UPDATE projects SET updated_at = datetime('now') WHERE id = ?`, [projectId]);
  return count;
}

async function writeSnapshot(root: string, files: Array<{ path: string; content: string }>) {
  for (const file of files) {
    const normalized = normalizeProjectPath(file.path);
    const target = path.join(root, normalized);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, file.content, "utf8");
  }
}

function runAllowedNpmScript(root: string, script: "build" | "test", timeoutMs: number): Promise<{ passed: boolean; output: string; timedOut: boolean }> {
  return new Promise((resolve) => {
    const child = spawn("npm", ["run", script], {
      cwd: root,
      env: {
        PATH: process.env.PATH ?? "",
        NODE_ENV: "test",
        CI: "1",
        HOME: root,
        npm_config_cache: path.join(root, ".npm-cache"),
      },
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    let timedOut = false;
    const append = (chunk: Buffer) => { output = `${output}${chunk.toString()}`.slice(-12000); };
    child.stdout.on("data", append);
    child.stderr.on("data", append);
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, timeoutMs);
    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({ passed: false, output: `${output}\n${error.message}`, timedOut });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ passed: code === 0 && !timedOut, output, timedOut });
    });
  });
}

async function validateProject(projectId: string): Promise<ValidationResult> {
  const files = await loadFiles(projectId);
  const packageFile = files.find((file) => file.path === "package.json");
  if (!packageFile) return { supported: false, passed: true, output: "No package.json validation commands detected." };
  let packageJson: { scripts?: Record<string, unknown> };
  try {
    packageJson = JSON.parse(packageFile.content);
  } catch {
    return { supported: true, passed: false, command: "package.json", output: "package.json is not valid JSON." };
  }
  const scripts = packageJson.scripts ?? {};
  const supportedScripts = (["build", "test"] as const).filter((script) => typeof scripts[script] === "string");
  if (!supportedScripts.length) return { supported: false, passed: true, output: "No supported build or test script detected." };

  const root = await fs.mkdtemp(path.join(os.tmpdir(), "lumen-agent-"));
  try {
    await writeSnapshot(root, files);
    for (const script of supportedScripts) {
      const result = await runAllowedNpmScript(root, script, env.agentValidationTimeoutMs);
      if (!result.passed) {
        return {
          supported: true,
          passed: false,
          command: `npm run ${script}`,
          output: `${result.timedOut ? "Validation timed out.\n" : ""}${result.output}`.trim(),
        };
      }
    }
    return { supported: true, passed: true, output: supportedScripts.map((script) => `npm run ${script} passed`).join("; ") };
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
}

async function failTask(taskId: string, message: string) {
  await db.run(`UPDATE agent_tasks SET status = 'failed', error = ?, finished_at = datetime('now') WHERE id = ?`, [message, taskId]);
  await event(taskId, "error", message);
}

export function startAgentTask(taskId: string) {
  if (activeTasks.has(taskId)) return;
  activeTasks.add(taskId);
  void runAgentTask(taskId).catch(async (error: unknown) => {
    await failTask(taskId, error instanceof Error ? error.message : "Agent task failed");
  }).finally(() => activeTasks.delete(taskId));
}

export async function resumeAgentTasks() {
  const tasks = await db.all<{ id: string }>(`SELECT id FROM agent_tasks WHERE status IN ('queued', 'running') ORDER BY created_at ASC`);
  tasks.forEach((task) => startAgentTask(task.id));
}

async function runAgentTask(taskId: string) {
  const task = await db.get<any>(`SELECT * FROM agent_tasks WHERE id = ?`, [taskId]);
  if (!task) return;
  try {
    const maxIterations = Math.min(Math.max(Number(task.max_iterations) || env.agentMaxIterations, 1), 12);
    await db.run(`UPDATE agent_tasks SET status = 'running', max_iterations = ?, started_at = COALESCE(started_at, datetime('now')) WHERE id = ?`, [maxIterations, taskId]);
    await event(taskId, "status", "Planning...");
    const project = await ownedProject(task.project_id, task.user_id);
    const provider = getProvider(task.provider);
    if (!provider) throw new Error(`Unknown provider: ${task.provider}`);
    const apiKey = await resolveApiKey(task.user_id, task.provider);
    if (provider.requiresApiKey && !apiKey) throw new Error(`No API key configured for ${provider.label}`);

    const changed = new Set<string>(JSON.parse(task.changed_files || "[]"));
    const requested = new Set<string>();
    const history: string[] = [];
    const startIteration = Number(task.iteration) || 0;

    for (let iteration = startIteration + 1; iteration <= maxIterations; iteration++) {
      await updateTask(taskId, { iteration });
      await event(taskId, "status", iteration === 1 ? "Reading project..." : "Inspecting changed files...");
      const files = await loadFiles(project.id);
      const system = `You are Lumen's safe, multi-step coding agent. Return ONLY JSON, with this schema: {"summary":"...","plan":"...","needed_files":["relative/path"],"operations":[{"type":"create_file|update_file|write_file|delete_file","path":"relative/path","content":"full file content for create/update/write"}],"done":true}. Use delete_file without content. Decide done=true only when the user's request is complete. You may request relevant files for the next iteration with needed_files. Never use absolute paths, ., .., shell commands, secrets, binary data, or commands selected by the model. Existing project: ${project.name}\nProject tree:\n${projectTree(files)}\nRelevant file contents:\n${compactContext(files, requested, changed)}\nPrevious agent actions, results, and errors:\n${history.slice(-8).join("\n") || "None"}`;
      const plan = await streamDecision(task, system, provider, apiKey);
      const nextFiles = [...(plan.needed_files ?? []), ...(plan.files ?? [])].filter((file): file is string => typeof file === "string");
      requested.clear();
      nextFiles.forEach((file) => requested.add(file));
      await event(taskId, "status", plan.plan ? `Plan: ${plan.plan}` : "Editing files...");
      const count = await applyOperations(project.id, plan.operations ?? [], taskId, changed);
      const summary = String(plan.summary ?? `Completed iteration ${iteration}.`);
      await updateTask(taskId, { result: summary, changedFiles: [...changed] });
      history.push(`Iteration ${iteration}: ${summary}; changed ${count} file(s).`);

      if (count > 0) {
        await event(taskId, "status", "Validating...");
        const validation = await validateProject(project.id);
        history.push(`Validation ${validation.command ?? "check"}: ${validation.output}`);
        if (!validation.passed) {
          await event(taskId, "status", "Build failed — fixing...");
          history.push(`Validation error: ${validation.output}`);
          if (iteration === maxIterations) {
            throw new Error(`Validation failed after ${maxIterations} iterations (${validation.command}): ${validation.output}`);
          }
          continue;
        }
        if (validation.supported) await event(taskId, "status", "Build passed.");
      }

      if (plan.done) {
        const result = `${summary}${changed.size ? ` Files changed: ${[...changed].join(", ")}.` : ""}`;
        await db.run(`UPDATE agent_tasks SET status = 'completed', result = ?, error = NULL, finished_at = datetime('now') WHERE id = ?`, [result, taskId]);
        await event(taskId, "done", result);
        return;
      }
      history.push("The agent must continue working.");
    }
    throw new Error(`Agent stopped after the maximum of ${maxIterations} iterations without completing the request.`);
  } catch (error: unknown) {
    await failTask(taskId, error instanceof Error ? error.message : "Agent task failed");
  }
}

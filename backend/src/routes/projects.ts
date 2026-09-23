import { Router } from "express";
import { v4 as uuid } from "uuid";
import { z } from "zod";
import { db } from "../db";
import { AuthedRequest, requireAuth } from "../middleware/auth";
import { HttpError } from "../middleware/errorHandler";
import { asyncHandler } from "../middleware/asyncHandler";
import { ownedProject, upsertProjectFile, normalizeProjectPath } from "../services/projectService";
import { startAgentTask } from "../services/agentService";

export const projectsRouter = Router();
projectsRouter.use(requireAuth);

projectsRouter.get("/", asyncHandler(async (req: AuthedRequest, res) => {
  const projects = await db.all(`SELECT * FROM projects WHERE user_id = ? ORDER BY updated_at DESC`, [req.userId]);
  res.json({ projects });
}));

projectsRouter.post("/", asyncHandler(async (req: AuthedRequest, res) => {
  const parsed = z.object({ name: z.string().min(1).max(120), description: z.string().max(1000).optional() }).safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, parsed.error.errors[0].message);
  const id = uuid();
  await db.run(`INSERT INTO projects (id, user_id, name, description, created_at, updated_at) VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))`, [id, req.userId, parsed.data.name, parsed.data.description ?? ""]);
  const project = await db.get(`SELECT * FROM projects WHERE id = ?`, [id]);
  res.status(201).json({ project });
}));

projectsRouter.get("/:id", asyncHandler(async (req: AuthedRequest, res) => {
  const project = await ownedProject(req.params.id, req.userId!);
  const files = await db.all(`SELECT id, path, content, is_binary, created_at, updated_at FROM project_files WHERE project_id = ? ORDER BY path`, [project.id]);
  res.json({ project, files });
}));

projectsRouter.put("/:id/files", asyncHandler(async (req: AuthedRequest, res) => {
  const project = await ownedProject(req.params.id, req.userId!);
  const parsed = z.object({ path: z.string().min(1).max(500), content: z.string().max(500000) }).safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, parsed.error.errors[0].message);
  await upsertProjectFile(project.id, parsed.data.path, parsed.data.content);
  await db.run(`UPDATE projects SET updated_at = datetime('now') WHERE id = ?`, [project.id]);
  res.json({ path: normalizeProjectPath(parsed.data.path) });
}));

projectsRouter.delete("/:id/files", asyncHandler(async (req: AuthedRequest, res) => {
  const project = await ownedProject(req.params.id, req.userId!);
  const path = normalizeProjectPath(String(req.query.path ?? ""));
  await db.run(`DELETE FROM project_files WHERE project_id = ? AND path = ?`, [project.id, path]);
  await db.run(`UPDATE projects SET updated_at = datetime('now') WHERE id = ?`, [project.id]);
  res.status(204).send();
}));

projectsRouter.post("/:id/tasks", asyncHandler(async (req: AuthedRequest, res) => {
  const project = await ownedProject(req.params.id, req.userId!);
  const parsed = z.object({ prompt: z.string().min(1).max(20000), provider: z.string().min(1), model: z.string().min(1) }).safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, parsed.error.errors[0].message);
  const id = uuid();
  await db.run(`INSERT INTO agent_tasks (id, project_id, user_id, prompt, provider, model, status, created_at) VALUES (?, ?, ?, ?, ?, ?, 'queued', datetime('now'))`, [id, project.id, req.userId, parsed.data.prompt, parsed.data.provider, parsed.data.model]);
  startAgentTask(id);
  res.status(202).json({ task: await db.get(`SELECT * FROM agent_tasks WHERE id = ?`, [id]) });
}));

projectsRouter.get("/:id/tasks", asyncHandler(async (req: AuthedRequest, res) => {
  const project = await ownedProject(req.params.id, req.userId!);
  const tasks = await db.all(`SELECT * FROM agent_tasks WHERE project_id = ? ORDER BY created_at DESC`, [project.id]);
  res.json({ tasks });
}));

projectsRouter.get("/:id/tasks/:taskId/events", asyncHandler(async (req: AuthedRequest, res) => {
  const project = await ownedProject(req.params.id, req.userId!);
  const task = await db.get(`SELECT * FROM agent_tasks WHERE id = ? AND project_id = ?`, [req.params.taskId, project.id]);
  if (!task) throw new HttpError(404, "Task not found");
  const events = await db.all(`SELECT * FROM agent_events WHERE task_id = ? ORDER BY created_at ASC`, [req.params.taskId]);
  res.json({ task, events });
}));

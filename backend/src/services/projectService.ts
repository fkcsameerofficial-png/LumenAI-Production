import { db } from "../db";
import { v4 as uuid } from "uuid";
import { HttpError } from "../middleware/errorHandler";

const MAX_FILE_SIZE = 500_000;

export function normalizeProjectPath(input: string): string {
  const value = input.replace(/\\/g, "/").replace(/^\/+/, "").trim();
  if (!value || value.includes("\0")) throw new HttpError(400, "Invalid project file path");
  const parts = value.split("/").filter(Boolean);
  if (parts.some((p) => p === "." || p === "..")) throw new HttpError(400, "Path traversal is not allowed");
  return parts.join("/");
}

export async function ownedProject(projectId: string, userId: string) {
  const project = await db.get<any>(`SELECT * FROM projects WHERE id = ? AND user_id = ?`, [projectId, userId]);
  if (!project) throw new HttpError(404, "Project not found");
  return project;
}

export async function upsertProjectFile(projectId: string, filePath: string, content: string) {
  const path = normalizeProjectPath(filePath);
  if (Buffer.byteLength(content, "utf8") > MAX_FILE_SIZE) throw new HttpError(400, "Project file is too large");
  const existing = await db.get<any>(`SELECT id FROM project_files WHERE project_id = ? AND path = ?`, [projectId, path]);
  if (existing) {
    await db.run(`UPDATE project_files SET content = ?, is_binary = 0, updated_at = datetime('now') WHERE id = ?`, [content, existing.id]);
    return existing.id;
  }
  const id = uuid();
  await db.run(`INSERT INTO project_files (id, project_id, path, content, is_binary, created_at, updated_at) VALUES (?, ?, ?, ?, 0, datetime('now'), datetime('now'))`, [id, projectId, path, content]);
  return id;
}

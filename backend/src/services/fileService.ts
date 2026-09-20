import fs from "fs";
import path from "path";
import { v4 as uuid } from "uuid";
import multer from "multer";
import { env } from "../config/env";
import { db } from "../db";
import { HttpError } from "../middleware/errorHandler";

fs.mkdirSync(env.uploadDir, { recursive: true });

export const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, env.uploadDir),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname);
      cb(null, `${uuid()}${ext}`);
    },
  }),
  limits: { fileSize: env.maxUploadMb * 1024 * 1024 },
});

const TEXT_EXTENSIONS = new Set([
  ".txt", ".md", ".json", ".js", ".ts", ".tsx", ".jsx", ".py", ".java", ".c", ".cpp", ".h",
  ".css", ".html", ".csv", ".yml", ".yaml", ".sh", ".go", ".rs", ".rb", ".php", ".sql", ".xml",
]);

export interface StoredFile {
  id: string;
  filename: string;
  mimetype: string;
  size: number;
  kind: "image" | "text" | "file";
}

export async function saveFileRecord(
  userId: string,
  conversationId: string | null,
  file: Express.Multer.File
): Promise<StoredFile> {
  const isImage = file.mimetype.startsWith("image/");
  const isText = TEXT_EXTENSIONS.has(path.extname(file.originalname).toLowerCase());
  const kind = isImage ? "image" : isText ? "text" : "file";

  const id = uuid();
  await db.run(
    `INSERT INTO files (id, user_id, conversation_id, filename, mimetype, size, storage_path, kind, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
    [id, userId, conversationId, file.originalname, file.mimetype, file.size, file.path, kind]
  );

  return { id, filename: file.originalname, mimetype: file.mimetype, size: file.size, kind };
}

export async function getFileRecord(fileId: string, userId: string) {
  const row = await db.get<any>(`SELECT * FROM files WHERE id = ? AND user_id = ?`, [fileId, userId]);
  if (!row) throw new HttpError(404, "File not found");
  return row;
}

/** For text/code files, read (truncated) content to inline as context for the model. */
export function readTextFileForContext(storagePath: string, maxChars = 20000): string {
  const raw = fs.readFileSync(storagePath, "utf-8");
  return raw.length > maxChars ? raw.slice(0, maxChars) + "\n...[truncated]" : raw;
}

/** For images, return a data: URL suitable for vision-capable providers. */
export function readImageAsDataUrl(storagePath: string, mimetype: string): string {
  const buf = fs.readFileSync(storagePath);
  return `data:${mimetype};base64,${buf.toString("base64")}`;
}

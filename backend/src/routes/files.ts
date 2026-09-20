import { Router } from "express";
import fs from "fs";
import { AuthedRequest, requireAuth } from "../middleware/auth";
import { asyncHandler } from "../middleware/asyncHandler";
import { upload, saveFileRecord, getFileRecord } from "../services/fileService";
import { HttpError } from "../middleware/errorHandler";

export const filesRouter = Router();
filesRouter.use(requireAuth);

filesRouter.post(
  "/",
  upload.single("file"),
  asyncHandler(async (req: AuthedRequest, res) => {
    if (!req.file) throw new HttpError(400, "No file uploaded");
    const conversationId = (req.body?.conversationId as string) || null;
    const record = await saveFileRecord(req.userId!, conversationId, req.file);
    res.status(201).json({ file: record });
  })
);

filesRouter.get(
  "/:id",
  asyncHandler(async (req: AuthedRequest, res) => {
    const record = await getFileRecord(req.params.id, req.userId!);
    if (!fs.existsSync(record.storage_path)) throw new HttpError(404, "File data missing on disk");
    res.setHeader("Content-Type", record.mimetype);
    res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(record.filename)}"`);
    fs.createReadStream(record.storage_path).pipe(res);
  })
);

filesRouter.delete(
  "/:id",
  asyncHandler(async (req: AuthedRequest, res) => {
    const record = await getFileRecord(req.params.id, req.userId!);
    try { fs.unlinkSync(record.storage_path); } catch { /* already gone */ }
    res.status(204).send();
  })
);

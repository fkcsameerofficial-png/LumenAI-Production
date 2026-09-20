import { Request, Response, NextFunction } from "express";
import { logger } from "../utils/logger";

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({ error: "Not found" });
}

export function errorHandler(err: any, req: Request, res: Response, next: NextFunction) {
  const status = err instanceof HttpError ? err.status : err.status ?? 500;
  if (status >= 500) {
    logger.error({ err }, "Unhandled error");
  }
  res.status(status).json({ error: err.message ?? "Internal server error" });
}

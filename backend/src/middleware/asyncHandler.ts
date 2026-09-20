import { Request, Response, NextFunction, RequestHandler } from "express";

/**
 * Wraps an async Express route handler so a rejected promise (e.g. a failed `await db.get(...)`
 * or an HttpError thrown after an await) is forwarded to next(err) and handled by the central
 * errorHandler, instead of becoming an unhandled rejection. Express 4 (used here) does not do
 * this automatically for async handlers the way Express 5 does.
 */
export function asyncHandler(fn: RequestHandler): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

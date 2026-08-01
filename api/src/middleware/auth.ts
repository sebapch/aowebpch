import type { Request, Response, NextFunction } from "express";
import config from "../config";
import { safeEquals } from "../lib/safeCompare";

export function requireAuth(request: Request, response: Response, next: NextFunction): void {
  if (!safeEquals(request.header("Authorization") ?? "", config.tokenAuth)) {
    response.status(401).json({ error: "Unauthorized" });
    return;
  }

  next();
}

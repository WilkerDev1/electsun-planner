import { z } from "zod";
import { STATUS_KINDS, type StatusKind } from "../domain.js";
import { color, version } from "./common.js";

export type Status = {
  id: string;
  name: string;
  kind: StatusKind;
  sort: number;
  fg: string;
  bg: string;
  dot: string;
  requires_schedule: boolean;
  requires_reason: boolean;
  version: number;
};

export const StatusPatch = z.object({
  version,
  name: z.string().trim().min(1).max(40).optional(),
  sort: z.number().int().min(0).max(99).optional(),
  fg: color.optional(),
  bg: color.optional(),
  dot: color.optional(),
});
export const StatusCreate = z.object({
  name: z.string().trim().min(1).max(40),
  kind: z.enum(STATUS_KINDS),
  fg: color,
  bg: color,
  dot: color,
});

import { z } from "zod";

export const updateDetectedBillStatusSchema = z.object({
  status: z.enum(["DETECTED", "CONFIRMED", "DISMISSED"]),
});

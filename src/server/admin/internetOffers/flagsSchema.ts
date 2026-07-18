import { z } from "zod";

export const updateOfferFlagsSchema = z
  .object({
    top5: z.boolean().optional(),
    issue: z.boolean().optional(),
  })
  .refine((v) => typeof v.top5 === "boolean" || typeof v.issue === "boolean", {
    message: "At least one of top5 or issue is required",
  });

export type UpdateOfferFlagsInput = z.infer<typeof updateOfferFlagsSchema>;

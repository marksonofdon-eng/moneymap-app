import { z } from "zod";
import { AUSTRALIAN_STATES } from "@/lib/australianStates";

export { AUSTRALIAN_STATES };

export const internetSavingsIntakeSchema = z
  .object({
    line1: z.string().trim().min(1).max(200),
    line2: z
      .string()
      .trim()
      .max(200)
      .optional()
      .transform((value) => (value ? value : undefined)),
    suburb: z.string().trim().min(1).max(120),
    state: z.enum(AUSTRALIAN_STATES),
    postcode: z.string().trim().regex(/^\d{4}$/, "postcode must be 4 digits"),
    minDownloadMbps: z.coerce.number().int().positive().max(10000),
    allowWired: z.boolean(),
    allow5g: z.boolean(),
    allowStarlink: z.boolean(),
  })
  .refine(
    (value) => value.allowWired || value.allow5g || value.allowStarlink,
    {
      message: "at_least_one_delivery_method",
      path: ["allowWired"],
    },
  );

export type InternetSavingsIntakeInput = z.infer<
  typeof internetSavingsIntakeSchema
>;

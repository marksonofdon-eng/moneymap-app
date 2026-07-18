import { z } from "zod";
import { OFFER_STATUS_VALUES } from "./columns";

export const updateOfferStatusSchema = z.object({
  status: z.enum(OFFER_STATUS_VALUES),
});

export type UpdateOfferStatusInput = z.infer<typeof updateOfferStatusSchema>;

import { z } from "zod";

export const updateUserSchema = z.object({
  displayName: z.string().min(2).max(50).optional(),
  username: z
    .string()
    .min(3)
    .max(30)
    .regex(/^[a-z0-9_]+$/, "Sadece küçük harf, rakam ve alt çizgi")
    .optional(),
  bio: z.string().max(500).optional(),
  location: z.string().max(100).optional(),
  instruments: z.array(z.string()).max(10).optional(),
  website: z.string().url().optional().or(z.literal("")),
  instagram: z.string().max(50).optional(),
  avatar: z.string().url().optional(),
});

export const sendMessageSchema = z.object({
  receiverId: z.string(),
  content: z.string().min(1).max(2000),
  listingId: z.string().optional(),
});

export const makeOfferSchema = z.object({
  listingId: z.string(),
  amount: z.number().int().min(1),
  note: z.string().max(500).optional(),
});

export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type SendMessageInput = z.infer<typeof sendMessageSchema>;
export type MakeOfferInput = z.infer<typeof makeOfferSchema>;

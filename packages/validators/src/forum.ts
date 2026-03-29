import { z } from "zod";

export const forumCategories = [
  "GENERAL",
  "GEAR_TALK",
  "TECHNIQUE",
  "THEORY",
  "RECOMMENDATION",
  "HELP",
  "MARKETPLACE_TALK",
  "OFF_TOPIC",
] as const;

export const forumCategoryLabels: Record<(typeof forumCategories)[number], string> = {
  GENERAL: "Genel",
  GEAR_TALK: "Ekipman Sohbeti",
  TECHNIQUE: "Teknik",
  THEORY: "Müzik Teorisi",
  RECOMMENDATION: "Tavsiye",
  HELP: "Yardım",
  MARKETPLACE_TALK: "Pazar Haberleri",
  OFF_TOPIC: "Konu Dışı",
};

export const createTopicSchema = z.object({
  title: z.string().min(5, "Başlık en az 5 karakter olmalı").max(200),
  category: z.enum(forumCategories).default("GENERAL"),
  tags: z.array(z.string().max(30)).max(5).default([]),
  // First entry is required when creating a topic
  firstEntry: z.string().min(10, "İçerik en az 10 karakter olmalı").max(10000),
});

export const createEntrySchema = z.object({
  topicId: z.string(),
  content: z.string().min(3, "İçerik en az 3 karakter olmalı").max(10000),
  parentEntryId: z.string().optional(),
});

export const updateEntrySchema = z.object({
  id: z.string(),
  content: z.string().min(3).max(10000),
});

export type CreateTopicInput = z.infer<typeof createTopicSchema>;
export type CreateEntryInput = z.infer<typeof createEntrySchema>;
export type UpdateEntryInput = z.infer<typeof updateEntrySchema>;

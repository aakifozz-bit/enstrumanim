import { z } from "zod";

export const listingConditions = [
  "MINT",
  "EXCELLENT",
  "GOOD",
  "FAIR",
  "POOR",
] as const;

export const listingCategories = [
  "GUITAR_ELECTRIC",
  "GUITAR_ACOUSTIC",
  "GUITAR_BASS",
  "GUITAR_CLASSICAL",
  "KEYBOARD",
  "SYNTH",
  "DRUMS",
  "PERCUSSION",
  "WIND",
  "STRINGS",
  "STUDIO_GEAR",
  "EFFECTS_PEDAL",
  "AMPLIFIER",
  "DJ_EQUIPMENT",
  "SOFTWARE",
  "ACCESSORIES",
  "OTHER",
] as const;

export const categoryLabels: Record<(typeof listingCategories)[number], string> = {
  GUITAR_ELECTRIC: "Elektro Gitar",
  GUITAR_ACOUSTIC: "Akustik Gitar",
  GUITAR_BASS: "Bas Gitar",
  GUITAR_CLASSICAL: "Klasik Gitar",
  KEYBOARD: "Klavye / Piyano",
  SYNTH: "Synthesizer",
  DRUMS: "Bateri",
  PERCUSSION: "Perküsyon",
  WIND: "Nefesli",
  STRINGS: "Yaylı",
  STUDIO_GEAR: "Stüdyo Ekipmanı",
  EFFECTS_PEDAL: "Efekt Pedalı",
  AMPLIFIER: "Amfi",
  DJ_EQUIPMENT: "DJ Ekipmanı",
  SOFTWARE: "Yazılım",
  ACCESSORIES: "Aksesuar",
  OTHER: "Diğer",
};

export const conditionLabels: Record<(typeof listingConditions)[number], string> = {
  MINT: "Sıfır Gibi",
  EXCELLENT: "Mükemmel",
  GOOD: "İyi",
  FAIR: "Orta",
  POOR: "Kullanılmış",
};

export const createListingSchema = z.object({
  title: z.string().min(5, "Başlık en az 5 karakter olmalı").max(100),
  description: z.string().min(20, "Açıklama en az 20 karakter olmalı").max(5000),
  price: z.number().int().min(1, "Fiyat 0'dan büyük olmalı"),
  originalPrice: z.number().int().optional(),
  condition: z.enum(listingConditions),
  category: z.enum(listingCategories),
  brand: z.string().optional(),
  model: z.string().optional(),
  year: z.number().int().min(1900).max(new Date().getFullYear()).optional(),
  images: z.array(z.string().url()).min(1, "En az 1 fotoğraf ekleyin").max(10),
  videos: z.array(z.string().url()).max(2).optional().default([]),
  location: z.string().optional(),
  isShippable: z.boolean().default(true),
  shippingCost: z.number().int().min(0).default(0),
  isNegotiable: z.boolean().default(true),
});

export const updateListingSchema = createListingSchema.partial().extend({
  id: z.string(),
  status: z.enum(["DRAFT", "ACTIVE", "RESERVED", "SOLD", "DELETED"]).optional(),
});

export type CreateListingInput = z.infer<typeof createListingSchema>;
export type UpdateListingInput = z.infer<typeof updateListingSchema>;

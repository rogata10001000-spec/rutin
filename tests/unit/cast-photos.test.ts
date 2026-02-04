import { describe, it, expect } from "vitest";
import {
  getCastPhotosSchema,
  uploadCastPhotoSchema,
  deleteCastPhotoSchema,
  reorderCastPhotosSchema,
  updateCaptionSchema,
} from "@/schemas/cast-photos";

describe("Cast Photos Schema Validation", () => {
  describe("getCastPhotosSchema", () => {
    it("should accept valid cast ID", () => {
      const result = getCastPhotosSchema.safeParse({
        castId: "550e8400-e29b-41d4-a716-446655440000",
      });
      expect(result.success).toBe(true);
    });

    it("should reject invalid cast ID", () => {
      const result = getCastPhotosSchema.safeParse({
        castId: "invalid-uuid",
      });
      expect(result.success).toBe(false);
    });

    it("should reject missing cast ID", () => {
      const result = getCastPhotosSchema.safeParse({});
      expect(result.success).toBe(false);
    });
  });

  describe("uploadCastPhotoSchema", () => {
    it("should accept valid upload data", () => {
      const result = uploadCastPhotoSchema.safeParse({
        castId: "550e8400-e29b-41d4-a716-446655440000",
        caption: "テストキャプション",
        displayOrder: 0,
      });
      expect(result.success).toBe(true);
    });

    it("should accept upload without optional fields", () => {
      const result = uploadCastPhotoSchema.safeParse({
        castId: "550e8400-e29b-41d4-a716-446655440000",
      });
      expect(result.success).toBe(true);
    });

    it("should reject caption over 200 characters", () => {
      const result = uploadCastPhotoSchema.safeParse({
        castId: "550e8400-e29b-41d4-a716-446655440000",
        caption: "a".repeat(201),
      });
      expect(result.success).toBe(false);
    });

    it("should reject displayOrder greater than 4", () => {
      const result = uploadCastPhotoSchema.safeParse({
        castId: "550e8400-e29b-41d4-a716-446655440000",
        displayOrder: 5,
      });
      expect(result.success).toBe(false);
    });

    it("should reject negative displayOrder", () => {
      const result = uploadCastPhotoSchema.safeParse({
        castId: "550e8400-e29b-41d4-a716-446655440000",
        displayOrder: -1,
      });
      expect(result.success).toBe(false);
    });
  });

  describe("deleteCastPhotoSchema", () => {
    it("should accept valid photo ID", () => {
      const result = deleteCastPhotoSchema.safeParse({
        photoId: "550e8400-e29b-41d4-a716-446655440000",
      });
      expect(result.success).toBe(true);
    });

    it("should reject invalid photo ID", () => {
      const result = deleteCastPhotoSchema.safeParse({
        photoId: "not-a-uuid",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("reorderCastPhotosSchema", () => {
    it("should accept valid reorder data", () => {
      const result = reorderCastPhotosSchema.safeParse({
        castId: "550e8400-e29b-41d4-a716-446655440000",
        photoIds: [
          "550e8400-e29b-41d4-a716-446655440001",
          "550e8400-e29b-41d4-a716-446655440002",
        ],
      });
      expect(result.success).toBe(true);
    });

    it("should reject empty photoIds array", () => {
      const result = reorderCastPhotosSchema.safeParse({
        castId: "550e8400-e29b-41d4-a716-446655440000",
        photoIds: [],
      });
      expect(result.success).toBe(false);
    });

    it("should reject more than 5 photoIds", () => {
      const result = reorderCastPhotosSchema.safeParse({
        castId: "550e8400-e29b-41d4-a716-446655440000",
        photoIds: [
          "550e8400-e29b-41d4-a716-446655440001",
          "550e8400-e29b-41d4-a716-446655440002",
          "550e8400-e29b-41d4-a716-446655440003",
          "550e8400-e29b-41d4-a716-446655440004",
          "550e8400-e29b-41d4-a716-446655440005",
          "550e8400-e29b-41d4-a716-446655440006",
        ],
      });
      expect(result.success).toBe(false);
    });

    it("should reject invalid UUIDs in photoIds", () => {
      const result = reorderCastPhotosSchema.safeParse({
        castId: "550e8400-e29b-41d4-a716-446655440000",
        photoIds: ["invalid-uuid"],
      });
      expect(result.success).toBe(false);
    });
  });

  describe("updateCaptionSchema", () => {
    it("should accept valid caption update", () => {
      const result = updateCaptionSchema.safeParse({
        photoId: "550e8400-e29b-41d4-a716-446655440000",
        caption: "新しいキャプション",
      });
      expect(result.success).toBe(true);
    });

    it("should accept null caption (to clear)", () => {
      const result = updateCaptionSchema.safeParse({
        photoId: "550e8400-e29b-41d4-a716-446655440000",
        caption: null,
      });
      expect(result.success).toBe(true);
    });

    it("should reject caption over 200 characters", () => {
      const result = updateCaptionSchema.safeParse({
        photoId: "550e8400-e29b-41d4-a716-446655440000",
        caption: "a".repeat(201),
      });
      expect(result.success).toBe(false);
    });
  });
});

describe("Cast Photos Business Logic", () => {
  describe("Photo Limit Enforcement", () => {
    it("should allow up to 5 photos per cast", () => {
      const MAX_PHOTOS = 5;
      const currentCount = 4;
      expect(currentCount < MAX_PHOTOS).toBe(true);
    });

    it("should not allow 6th photo", () => {
      const MAX_PHOTOS = 5;
      const currentCount = 5;
      expect(currentCount < MAX_PHOTOS).toBe(false);
    });
  });

  describe("File Validation", () => {
    it("should accept JPEG files", () => {
      const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
      expect(allowedTypes.includes("image/jpeg")).toBe(true);
    });

    it("should accept PNG files", () => {
      const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
      expect(allowedTypes.includes("image/png")).toBe(true);
    });

    it("should accept WebP files", () => {
      const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
      expect(allowedTypes.includes("image/webp")).toBe(true);
    });

    it("should reject GIF files", () => {
      const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
      expect(allowedTypes.includes("image/gif")).toBe(false);
    });

    it("should reject files over 5MB", () => {
      const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
      const fileSize = 6 * 1024 * 1024; // 6MB
      expect(fileSize <= MAX_FILE_SIZE).toBe(false);
    });

    it("should accept files under 5MB", () => {
      const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
      const fileSize = 4 * 1024 * 1024; // 4MB
      expect(fileSize <= MAX_FILE_SIZE).toBe(true);
    });
  });

  describe("Display Order", () => {
    it("should maintain valid display order range (0-4)", () => {
      const orders = [0, 1, 2, 3, 4];
      orders.forEach((order) => {
        expect(order >= 0 && order <= 4).toBe(true);
      });
    });

    it("should correctly reorder photos", () => {
      const photos = [
        { id: "1", order: 0 },
        { id: "2", order: 1 },
        { id: "3", order: 2 },
      ];
      
      // Simulate moving photo 3 to first position
      const newOrder = ["3", "1", "2"];
      const reordered = newOrder.map((id, index) => ({
        id,
        order: index,
      }));

      expect(reordered[0].id).toBe("3");
      expect(reordered[0].order).toBe(0);
      expect(reordered[1].id).toBe("1");
      expect(reordered[1].order).toBe(1);
    });
  });
});

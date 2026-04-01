"use client";

import { createClient } from "@/lib/supabase/client";

const BUCKET = "documents";

/**
 * Upload a file to Supabase Storage.
 * Path: {userId}/{collectionId}/{folder}/{filename}
 * Returns the storage path or null on failure.
 */
export async function uploadFile(
  userId: string,
  collectionId: string,
  folder: "originals" | "reports",
  fileName: string,
  file: File | Blob,
): Promise<string | null> {
  try {
    const supabase = createClient();
    const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${userId}/${collectionId}/${folder}/${safeName}`;

    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, file, { upsert: true });

    if (error) {
      console.error("Upload error:", error.message);
      return null;
    }
    return path;
  } catch (err) {
    console.error("Upload crash:", err);
    return null;
  }
}

/**
 * Get a temporary signed URL for downloading a file.
 */
export async function getDownloadUrl(path: string): Promise<string | null> {
  try {
    const supabase = createClient();
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(path, 3600); // 1 hour

    if (error) {
      console.error("Signed URL error:", error.message);
      return null;
    }
    return data.signedUrl;
  } catch {
    return null;
  }
}

/**
 * List files in a collection folder.
 */
export async function listFiles(
  userId: string,
  collectionId: string,
  folder: "originals" | "reports",
): Promise<{ name: string; path: string }[]> {
  try {
    const supabase = createClient();
    const prefix = `${userId}/${collectionId}/${folder}`;
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .list(prefix);

    if (error || !data) return [];
    return data.map(f => ({ name: f.name, path: `${prefix}/${f.name}` }));
  } catch {
    return [];
  }
}

/**
 * Delete all files in a collection (when deleting from history).
 */
export async function deleteCollectionFiles(
  userId: string,
  collectionId: string,
): Promise<void> {
  try {
    const supabase = createClient();
    for (const folder of ["originals", "reports"] as const) {
      const files = await listFiles(userId, collectionId, folder);
      if (files.length > 0) {
        await supabase.storage
          .from(BUCKET)
          .remove(files.map(f => f.path));
      }
    }
  } catch (err) {
    console.error("Delete files error:", err);
  }
}

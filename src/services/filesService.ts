import { supabase } from "../lib/supabaseClient";
import type { OrderFile, FileCategory } from "../types/database";

export async function listFiles(orderId: string) {
  const { data, error } = await supabase
    .from("files")
    .select("*, uploader:profiles(full_name)")
    .eq("order_id", orderId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data as unknown as OrderFile[];
}

// Uploads the bytes to Storage first, then records the metadata row.
// If the metadata insert fails (e.g. RLS rejects the category for this
// role), the uploaded object is removed so it isn't orphaned.
export async function uploadFile(orderId: string, category: FileCategory, file: File) {
  const { data: userData } = await supabase.auth.getUser();
  const safeName = file.name.replace(/[^\w.\-]+/g, "_");
  const path = `${orderId}/${category}/${Date.now()}_${safeName}`;

  const { error: uploadError } = await supabase.storage.from("order-files").upload(path, file);
  if (uploadError) throw uploadError;

  const { data, error } = await supabase
    .from("files")
    .insert({
      order_id: orderId,
      category,
      storage_path: path,
      file_name: file.name,
      uploaded_by: userData.user?.id,
    })
    .select()
    .single();

  if (error) {
    await supabase.storage.from("order-files").remove([path]);
    throw error;
  }
  return data as OrderFile;
}

// Signed URL, short-lived — files are private, never public.
export async function getFileDownloadUrl(storagePath: string) {
  const { data, error } = await supabase.storage
    .from("order-files")
    .createSignedUrl(storagePath, 60 * 5); // 5 minutes
  if (error) throw error;
  return data.signedUrl;
}

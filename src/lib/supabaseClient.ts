import { createClient } from "@supabase/supabase-js";
import type { Database } from "../types/database";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY — copy .env.example to .env.local and fill them in."
  );
}

// Only the anon/public key is ever used here. It is safe to ship in the
// frontend bundle: every table it can touch is protected by RLS policies
// defined in supabase/schema.sql. The service_role key must never appear
// in this project.
export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey);

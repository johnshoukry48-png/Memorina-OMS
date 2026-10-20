import { supabase } from "../lib/supabaseClient";
import type { Customer } from "../types/database";

export async function listCustomers(search?: string) {
  let query = supabase.from("customers").select("*").order("created_at", { ascending: false });
  if (search) {
    query = query.or(`name.ilike.%${search}%,phone.ilike.%${search}%`);
  }
  const { data, error } = await query;
  if (error) throw error;
  return data as Customer[];
}

export async function createCustomer(input: {
  name: string;
  phone: string;
  secondary_phone?: string;
  address?: string;
  notes?: string;
}) {
  const { data: userData } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("customers")
    .insert({ ...input, created_by: userData.user?.id })
    .select()
    .single();
  if (error) throw error;
  return data as Customer;
}

// Hand-written through Phase 2. Consider switching to generated types later:
//   npx supabase gen types typescript --project-id YOUR_PROJECT_REF > src/types/database.ts

export type UserRole =
  | "admin"
  | "order_manager"
  | "designer"
  | "printing"
  | "assembly"
  | "packaging"
  | "shipping";

export interface Profile {
  id: string;
  full_name: string;
  phone: string | null;
  role: UserRole | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  secondary_phone: string | null;
  address: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type WorkflowStageCode =
  | "NEW"
  | "DESIGN"
  | "PRINTING"
  | "ASSEMBLY"
  | "PACKAGING"
  | "SHIPPING"
  | "DELIVERED"
  | "CANCELLED";

export type OrderPriority = "low" | "normal" | "high" | "urgent";
export type OrderOverallStatus = "active" | "completed" | "cancelled";

export interface Order {
  id: string;
  order_number: number;
  customer_id: string;
  status: OrderOverallStatus;
  current_stage: WorkflowStageCode;
  assigned_user_id: string | null;
  priority: OrderPriority;
  order_date: string;
  due_date: string | null;
  shipping_address: string | null;
  shipping_company: string | null;
  tracking_number: string | null;
  discount: number;
  shipping_cost: number;
  subtotal: number;
  grand_total: number;
  total_paid: number;
  remaining_balance: number;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  // joined, when requested
  customer?: Customer;
}

export interface OrderItem {
  id: string;
  order_id: string;
  name: string;
  description: string | null;
  quantity: number;
  size: string | null;
  unit_price: number;
  total_price: number;
  production_notes: string | null;
  design_notes: string | null;
  created_at: string;
}

export interface NewOrderItemInput {
  name: string;
  description?: string;
  quantity: number;
  size?: string;
  unit_price: number;
  production_notes?: string;
  design_notes?: string;
}

export type FileCategory = "CUSTOMER_REFERENCE" | "DESIGN" | "PRINTING" | "SHIPPING" | "OTHER";

export interface OrderFile {
  id: string;
  order_id: string;
  category: FileCategory;
  storage_path: string;
  file_name: string;
  uploaded_by: string | null;
  created_at: string;
  uploader?: { full_name: string } | null;
}

export interface Comment {
  id: string;
  order_id: string;
  user_id: string;
  message: string;
  attachment_file_id: string | null;
  created_at: string;
  user?: { full_name: string } | null;
}

export interface AuditLog {
  id: string;
  order_id: string | null;
  user_id: string | null;
  action: string;
  from_value: string | null;
  to_value: string | null;
  created_at: string;
  user?: { full_name: string } | null;
}

export type PaymentMethod = "CASH" | "INSTAPAY" | "VODAFONE_CASH";

export interface Payment {
  id: string;
  order_id: string;
  amount: number;
  method: PaymentMethod;
  recorded_by: string | null;
  notes: string | null;
  created_at: string;
  recorder?: { full_name: string } | null;
}

export interface Expense {
  id: string;
  order_id: string | null;
  category: string;
  amount: number;
  description: string | null;
  payment_method: PaymentMethod | null;
  created_by: string | null;
  created_at: string;
}

export interface OrderFinancialsAdmin {
  order_id: string;
  order_number: number;
  grand_total: number;
  total_paid: number;
  remaining_balance: number;
  total_expenses: number;
  net_result: number;
}

export interface AppNotification {
  id: string;
  user_id: string;
  order_id: string | null;
  type: string;
  message_ar: string;
  read_at: string | null;
  created_at: string;
}

export interface Database {
  public: {
    Tables: {
      profiles: { Row: Profile; Insert: Partial<Profile> & { id: string; full_name: string }; Update: Partial<Profile> };
      customers: { Row: Customer; Insert: Partial<Customer> & { name: string; phone: string }; Update: Partial<Customer> };
      orders: { Row: Order; Insert: Partial<Order> & { customer_id: string }; Update: Partial<Order> };
      order_items: { Row: OrderItem; Insert: Partial<OrderItem> & { order_id: string; name: string; quantity: number; unit_price: number }; Update: Partial<OrderItem> };
    };
  };
}

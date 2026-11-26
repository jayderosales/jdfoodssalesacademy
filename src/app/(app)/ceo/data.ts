import "server-only";
import { createClient } from "@/lib/supabase/server";

export interface Snapshot {
  today: string;
  sales: { today: string; orders_today: number; yesterday: string; mtd: string; orders_mtd: number; last_month_same_days: string; last_month: string; ytd: string; orders_ytd: number };
  target: { month: string | null; ytd: string | null; days_in_month: number; day_of_month: number };
  ledger: { revenue: string; cost_of_sales: string; net_income: string; cash: string; books_live: boolean };
  receivables: { owed: string; overdue: string; overdue_customers: number };
  payables: { owed: string; due_7_days: string; overdue: string };
  payments_pending: { count: number; amount: string };
  inventory: { value: string };
  reorder: { below_min: number; out_of_stock: number };
  near_expiry: { lots: number; value: string };
  production_today: { lots: number; products: number };
  incomplete_orders: { count: number };
  approvals: { count: number; amount: string };
  risks: { count: number };
  unposted: { count: number };
}

export async function loadSnapshot() {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("ceo_snapshot");
  if (error) throw new Error(error.message);
  return data as Snapshot;
}

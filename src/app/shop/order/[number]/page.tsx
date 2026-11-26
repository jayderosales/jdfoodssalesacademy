import { OrderView } from "../order-view";

export const metadata = { title: "Your order", robots: { index: false } };

export default async function OrderPage({ params, searchParams }: { params: Promise<{ number: string }>; searchParams: Promise<{ new?: string }> }) {
  const { number } = await params;
  const sp = await searchParams;
  return <OrderView number={decodeURIComponent(number).toUpperCase()} isNew={sp.new === "1"} />;
}

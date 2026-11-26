import { getPaymentDetails } from "../actions";
import { CartView } from "./cart-view";

export const metadata = { title: "Cart" };

export default async function CartPage() {
  return <CartView payment={await getPaymentDetails()} />;
}

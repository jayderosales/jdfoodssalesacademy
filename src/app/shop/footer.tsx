import Link from "next/link";

export function ShopFooter({ name }: { name: string }) {
  return (
    <footer className="border-t bg-muted/40">
      <div className="mx-auto grid max-w-6xl gap-4 px-4 py-6 text-sm text-muted-foreground sm:grid-cols-3">
        <div>
          <p className="font-semibold text-foreground">{name}</p>
          <p>Unit C-12 C Philasia Pacific Realty and Dev&apos;t Compound, Bulihan, Plaridel, Bulacan</p>
        </div>
        <div>
          <p className="font-semibold text-foreground">Delivery</p>
          <p>We hand your order to the courier you choose. Shipping is paid by you directly to the courier.</p>
        </div>
        <div>
          <p className="font-semibold text-foreground">Staff</p>
          <Link href="/login" className="underline">Sign in to JD Foods OS</Link>
        </div>
      </div>
    </footer>
  );
}

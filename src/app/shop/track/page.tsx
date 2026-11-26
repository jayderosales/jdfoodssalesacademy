import { TrackForm } from "./track-form";

export const metadata = { title: "Track your order" };

export default function TrackPage() {
  return (
    <div className="mx-auto max-w-md space-y-4 py-6">
      <h1 className="text-2xl font-bold">Track your order</h1>
      <p className="text-sm text-muted-foreground">Enter the order number from your confirmation (it starts with SO-) and the mobile number you used.</p>
      <TrackForm />
    </div>
  );
}

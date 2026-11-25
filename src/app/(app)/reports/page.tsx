import { ComingSoon } from "@/components/coming-soon";
import { requireOwner } from "@/lib/auth";

export const metadata = { title: "Reports" };

export default async function Page() {
  await requireOwner();
  return (
    <ComingSoon title="Reports" phase={4}>
      Company dashboards, time-to-Field-Ready, exports.
    </ComingSoon>
  );
}

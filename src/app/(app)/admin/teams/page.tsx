import { redirect } from "next/navigation";

/** Moved to Organization → Sales teams (Phase 1a). */
export default function TeamsMoved() {
  redirect("/admin/org/teams");
}

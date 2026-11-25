import type { UserRole } from "@/lib/types";

export type IconName =
  | "home" | "book" | "quiz" | "chat" | "user" | "users" | "team" | "review"
  | "content" | "chart" | "settings" | "audit";

export interface NavItem {
  href: string;
  label: string;
  icon: IconName;
  /** shown in the phone bottom bar (max 5 per role) */
  mobile?: boolean;
}

const rep: NavItem[] = [
  { href: "/dashboard", label: "Home", icon: "home", mobile: true },
  { href: "/learn", label: "Learn", icon: "book", mobile: true },
  { href: "/quizzes", label: "Quizzes", icon: "quiz", mobile: true },
  { href: "/roleplay", label: "Roleplay", icon: "chat", mobile: true },
  { href: "/account", label: "Me", icon: "user", mobile: true },
];

const manager: NavItem[] = [
  { href: "/dashboard", label: "Home", icon: "home", mobile: true },
  { href: "/team", label: "My team", icon: "team", mobile: true },
  { href: "/reviews", label: "Reviews", icon: "review", mobile: true },
  { href: "/learn", label: "Learn", icon: "book" },
  { href: "/roleplay", label: "Roleplay", icon: "chat", mobile: true },
  { href: "/reports", label: "Reports", icon: "chart" },
  { href: "/signup-links", label: "Sign-up links", icon: "users" },
  { href: "/account", label: "Me", icon: "user", mobile: true },
];

const owner: NavItem[] = [
  { href: "/dashboard", label: "Home", icon: "home", mobile: true },
  { href: "/team", label: "All reps", icon: "team", mobile: true },
  { href: "/admin/users", label: "Users", icon: "users", mobile: true },
  { href: "/signup-links", label: "Sign-up links", icon: "users" },
  { href: "/admin/teams", label: "Teams & branches", icon: "team" },
  { href: "/admin/content", label: "Content", icon: "content" },
  { href: "/reviews", label: "Reviews", icon: "review" },
  { href: "/reports", label: "Reports", icon: "chart", mobile: true },
  { href: "/admin/settings", label: "Settings", icon: "settings", mobile: true },
  { href: "/admin/audit", label: "Audit log", icon: "audit" },
  { href: "/account", label: "My account", icon: "user" },
];

export function navFor(role: UserRole): NavItem[] {
  return role === "owner" ? owner : role === "manager" ? manager : rep;
}

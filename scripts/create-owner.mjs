// Creates the first Owner/Admin account (public sign-up is disabled).
// Usage:  npm run create-owner -- owner@jdfoods.ph "Full Name"
// The password is read from the OWNER_PASSWORD environment variable, or a random one is generated and printed once.
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const [email, fullName] = process.argv.slice(2);
if (!email || !fullName) {
  console.error('Usage: npm run create-owner -- <email> "<Full Name>"');
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local first.");
  process.exit(1);
}

const password = process.env.OWNER_PASSWORD || randomBytes(12).toString("base64url");
const supabase = createClient(url, key, { auth: { persistSession: false } });

const { data, error } = await supabase.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
  app_metadata: { role: "owner", full_name: fullName },
});
if (error) {
  console.error("Failed:", error.message);
  process.exit(1);
}

// The DB trigger creates the profile from app_metadata; make sure role/name are set.
await supabase.from("profiles").update({ role: "owner", full_name: fullName }).eq("id", data.user.id);

console.log(`Owner created: ${email}`);
if (!process.env.OWNER_PASSWORD) console.log(`Temporary password (shown once, change it under "My account"): ${password}`);

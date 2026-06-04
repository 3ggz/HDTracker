import { redirect } from "next/navigation";

// /admin/resets folded into /admin/approvals — kept as a one-line
// redirect so any saved bookmark / banner-link still lands.
export default function PasswordResetsRedirect() {
  redirect("/admin/approvals");
}

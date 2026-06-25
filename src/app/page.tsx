import { redirect } from "next/navigation";

// Jobs is the day-to-day work surface — landing on it is what
// everyone actually wants when they open the app. Inventory now
// lives at /vehicles. Auth middleware still hits "/" first, so this
// redirect runs after a session refresh, which keeps the existing
// signin → "/" → home flow intact.
export default function RootRedirect() {
  redirect("/jobs");
}

import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function OwnerLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (user.role !== "OWNER") {
    redirect("/dashboard");
  }
  return <>{children}</>;
}

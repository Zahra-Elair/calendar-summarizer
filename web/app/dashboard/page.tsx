import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { SignOutButton } from "@/components/SignOutButton";
import { DashboardClient } from "@/components/DashboardClient";

export default async function Dashboard() {
  const session = await auth();
  if (!session) redirect("/");
  return (
    <main className="mx-auto max-w-2xl p-6">
      <header className="mb-8 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Your calendar summary</h1>
        <div className="flex items-center gap-3 text-sm text-gray-600">
          <span>{session.user?.name}</span>
          <SignOutButton />
        </div>
      </header>
      <DashboardClient />
    </main>
  );
}

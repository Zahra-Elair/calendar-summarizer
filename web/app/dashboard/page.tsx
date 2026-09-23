import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { SignInButton } from "@/components/SignInButton";
import { SignOutButton } from "@/components/SignOutButton";
import { DashboardClient } from "@/components/DashboardClient";

export default async function Dashboard() {
  const session = await auth();
  if (!session) redirect("/");

  // The user is signed in but declined the calendar permission on Google's
  // consent screen — prompt them to grant it before showing the dashboard.
  if (session.calendarGranted === false) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-5 p-6 text-center">
        <h1 className="text-2xl font-bold">Calendar access needed</h1>
        <p className="text-gray-600">
          This app needs read access to your Google Calendar to summarize it.
          Please sign in again and allow the calendar permission.
        </p>
        <SignInButton />
        <SignOutButton />
      </main>
    );
  }

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

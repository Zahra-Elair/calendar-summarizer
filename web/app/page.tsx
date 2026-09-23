import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { SignInButton } from "@/components/SignInButton";

export default async function Home() {
  const session = await auth();
  if (session) redirect("/dashboard");
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8 text-center">
      <h1 className="text-4xl font-bold">Calendar Summarizer</h1>
      <p className="max-w-md text-gray-600">
        AI summaries of your Google Calendar — daily, weekly, or monthly.
      </p>
      <SignInButton />
    </main>
  );
}

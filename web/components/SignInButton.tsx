import { signIn } from "@/auth";

export function SignInButton() {
  return (
    <form
      action={async () => {
        "use server";
        await signIn("google", { redirectTo: "/dashboard" });
      }}
    >
      <button
        type="submit"
        className="rounded-lg bg-black px-5 py-2.5 text-white hover:bg-gray-800"
      >
        Sign in with Google
      </button>
    </form>
  );
}

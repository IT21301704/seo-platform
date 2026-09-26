import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { auth, devLoginEnabled, googleEnabled, signIn } from "@/auth";
import { Button, Card } from "@/components/ui";

async function emailSignIn(formData: FormData): Promise<void> {
  "use server";
  await signIn("email", { email: String(formData.get("email") ?? ""), redirectTo: "/" });
}

async function googleSignIn(): Promise<void> {
  "use server";
  await signIn("google", { redirectTo: "/" });
}

async function devSignIn(formData: FormData): Promise<void> {
  "use server";
  try {
    await signIn("dev-login", { email: String(formData.get("email") ?? ""), redirectTo: "/" });
  } catch (error) {
    if (error instanceof AuthError) redirect("/signin?error=dev");
    throw error;
  }
}

const input =
  "h-10 w-full rounded-lg border border-[#CFCFC8] bg-white px-3 text-sm text-ink placeholder:text-muted focus:border-primary focus:outline-none";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; error?: string }>;
}) {
  if ((await auth())?.user) redirect("/");
  const { sent, error } = await searchParams;
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <Card className="flex w-full max-w-sm flex-col gap-5 p-6">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-[7px] bg-primary">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#FFFFFF"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M4 17l5-5 4 4 7-8" />
            </svg>
          </div>
          <span className="text-base font-bold">SEO Platform</span>
        </div>
        <h1 className="m-0 text-2xl font-bold">Sign in</h1>
        {sent && (
          <p className="m-0 rounded-lg bg-primary-soft p-3 text-sm text-primary">
            Check your email for a sign-in link.
          </p>
        )}
        {error && (
          <p className="m-0 rounded-lg bg-crit-bg p-3 text-sm text-crit">
            Sign-in failed. Check the email address and try again.
          </p>
        )}
        <form action={emailSignIn} className="flex flex-col gap-3">
          <label htmlFor="email" className="text-sm font-semibold">
            Email address
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            className={input}
            placeholder="you@example-store.com"
          />
          <Button type="submit">Email me a sign-in link</Button>
        </form>
        {googleEnabled && (
          <form action={googleSignIn}>
            <Button type="submit" variant="secondary" className="w-full">
              Continue with Google
            </Button>
          </form>
        )}
        {devLoginEnabled && (
          <form action={devSignIn} className="flex flex-col gap-2 border-t border-line pt-4">
            <label
              htmlFor="dev-email"
              className="text-xs font-semibold uppercase tracking-wide text-muted"
            >
              Development login (AUTH_DEV_LOGIN)
            </label>
            <input
              id="dev-email"
              name="email"
              type="email"
              defaultValue="owner@example-store.com"
              className={input}
            />
            <Button type="submit" variant="secondary">
              Sign in without email
            </Button>
          </form>
        )}
      </Card>
    </main>
  );
}

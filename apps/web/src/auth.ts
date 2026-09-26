import { createHash } from "node:crypto";
import NextAuth from "next-auth";
import type { Adapter, AdapterUser } from "next-auth/adapters";
import Credentials from "next-auth/providers/credentials";
import type { EmailConfig } from "next-auth/providers/email";
import Google from "next-auth/providers/google";
import type { Provider } from "next-auth/providers";
import { createTransport } from "nodemailer";
import { prisma } from "@/lib/db";

declare module "next-auth" {
  interface Session {
    user: { id: string; email: string; name?: string | null; image?: string | null };
  }
}

const toAdapterUser = (u: {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
  emailVerified: Date | null;
}): AdapterUser => ({
  id: u.id,
  email: u.email,
  name: u.name,
  image: u.image,
  emailVerified: u.emailVerified,
});

/**
 * Auth.js adapter on our Prisma client. A new user gets their own organization and is its
 * Owner (every user belongs to exactly one organization in Phase 1).
 */
const adapter: Adapter = {
  async createUser(user) {
    const created = await prisma.$transaction(async (tx) => {
      const org = await tx.organization.create({
        data: { name: user.email.split("@")[1] ?? user.email },
      });
      return tx.user.create({
        data: {
          organizationId: org.id,
          email: user.email.toLowerCase(),
          name: user.name ?? null,
          image: user.image ?? null,
          emailVerified: user.emailVerified,
          role: "owner",
        },
      });
    });
    return toAdapterUser(created);
  },
  async getUser(id) {
    const u = await prisma.user.findUnique({ where: { id } });
    return u ? toAdapterUser(u) : null;
  },
  async getUserByEmail(email) {
    const u = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    return u ? toAdapterUser(u) : null;
  },
  async getUserByAccount({ provider, providerAccountId }) {
    const account = await prisma.account.findUnique({
      where: { provider_providerAccountId: { provider, providerAccountId } },
      include: { user: true },
    });
    return account ? toAdapterUser(account.user) : null;
  },
  async updateUser(user) {
    const u = await prisma.user.update({
      where: { id: user.id },
      data: {
        name: user.name ?? undefined,
        image: user.image ?? undefined,
        emailVerified: user.emailVerified ?? undefined,
      },
    });
    return toAdapterUser(u);
  },
  async linkAccount(account) {
    await prisma.account.create({
      data: {
        userId: account.userId,
        type: account.type,
        provider: account.provider,
        providerAccountId: account.providerAccountId,
        // OAuth tokens are not needed for sign-in; GSC/GA4 tokens are stored encrypted separately (Phase 2).
        expires_at: account.expires_at ?? null,
        token_type: account.token_type ?? null,
        scope: account.scope ?? null,
      },
    });
  },
  async createVerificationToken(token) {
    await prisma.verificationToken.create({ data: token });
    return token;
  },
  async useVerificationToken({ identifier, token }) {
    try {
      return await prisma.verificationToken.delete({
        where: { identifier_token: { identifier, token } },
      });
    } catch {
      return null;
    }
  },
};

const emailProvider: EmailConfig = {
  id: "email",
  type: "email",
  name: "Email",
  from: process.env["EMAIL_FROM"] ?? "SEO Platform <no-reply@localhost>",
  maxAge: 24 * 60 * 60,
  async sendVerificationRequest({ identifier, url }) {
    const server = process.env["EMAIL_SERVER"];
    if (!server) {
      // Development: no SMTP configured, so print the sign-in link to the server log.
      console.log(`\n[auth] Sign-in link for ${identifier}:\n${url}\n`);
      return;
    }
    await createTransport(server).sendMail({
      to: identifier,
      from: process.env["EMAIL_FROM"] ?? "SEO Platform <no-reply@localhost>",
      subject: "Sign in to SEO Platform",
      text: `Sign in to SEO Platform:\n${url}\n\nIf you did not request this, ignore this email.`,
    });
  },
};

export const devLoginEnabled =
  process.env["AUTH_DEV_LOGIN"] === "true" && process.env.NODE_ENV !== "production";
export const googleEnabled = Boolean(
  process.env["GOOGLE_CLIENT_ID"] && process.env["GOOGLE_CLIENT_SECRET"],
);

const providers: Provider[] = [emailProvider];
if (googleEnabled) providers.push(Google);
if (devLoginEnabled) {
  // Local development and e2e tests only: sign in as an existing user without a password.
  providers.push(
    Credentials({
      id: "dev-login",
      name: "Development login",
      credentials: { email: { label: "Email", type: "email" } },
      async authorize(credentials) {
        const email = String(credentials?.email ?? "").toLowerCase();
        const user = await prisma.user.findUnique({ where: { email } });
        return user ? { id: user.id, email: user.email, name: user.name } : null;
      },
    }),
  );
}

// Production requires AUTH_SECRET (or NEXTAUTH_SECRET). In development only, fall back to a
// value derived from the local DATABASE_URL, so every route bundle shares one secret without
// a secret being committed.
const secret =
  process.env["AUTH_SECRET"] ||
  process.env["NEXTAUTH_SECRET"] ||
  (process.env.NODE_ENV === "production"
    ? undefined
    : createHash("sha256")
        .update(`seo-platform-dev-auth:${process.env["DATABASE_URL"] ?? ""}`)
        .digest("hex"));

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter,
  providers,
  secret,
  trustHost: true,
  session: { strategy: "jwt" },
  pages: { signIn: "/signin", verifyRequest: "/signin?sent=1" },
  callbacks: {
    jwt({ token, user }) {
      if (user?.id) token.sub = user.id;
      return token;
    },
    session({ session, token }) {
      if (token.sub) session.user.id = token.sub;
      return session;
    },
  },
});

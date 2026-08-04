/**
 * NextAuth.js configuration.
 *
 * Providers:
 *  - Credentials (email + password) — always available; backed by the `users`
 *    table. Passwords are bcrypt-hashed (see `lib/auth/password.ts`).
 *  - GitHub OAuth — enabled when GITHUB_ID / GITHUB_SECRET are set.
 *  - Google OAuth — enabled when GOOGLE_ID / GOOGLE_SECRET are set.
 *
 * The Drizzle adapter persists sessions/accounts to SQLite so sessions survive
 * process restarts (important for the long-running generation pipeline).
 *
 * The `role` from the users table is propagated into the JWT and session so
 * the RBAC helpers in `lib/auth/rbac.ts` can read it server-side and the
 * frontend can show/hide admin UI.
 */
import type { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import GitHubProvider from 'next-auth/providers/github';
import GoogleProvider from 'next-auth/providers/google';
import { DrizzleAdapter } from '@auth/drizzle-adapter';
import { and, eq } from 'drizzle-orm';
import { getDb } from '@/lib/db/client';
import { users, accounts } from '@/lib/db/schema';
import { hashPassword, verifyPassword } from './password';
import type { Role } from './rbac';
import { getSsoProviders } from './sso-providers';
import { createLogger } from '@/lib/logger';

const log = createLogger('Auth');

/**
 * Resolve the secret used to sign JWTs. Falls back to a dev-only deterministic
 * secret so local development works without env config; production MUST set
 * NEXTAUTH_SECRET (enforced by the startup check in `lib/config/feature-flags`).
 */
function resolveSecret(): string {
  const secret = process.env.NEXTAUTH_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'NEXTAUTH_SECRET must be set in production. Generate one with: openssl rand -base64 32',
    );
  }
  log.warn('NEXTAUTH_SECRET not set — using insecure dev default. Do NOT use in production.');
  return 'nova-dev-secret-do-not-use-in-production';
}

export const authOptions: NextAuthOptions = {
  adapter: DrizzleAdapter(getDb(), {
    usersTable: users as never,
    accountsTable: accounts as never,
  }) as never,
  session: { strategy: 'jwt' },
  secret: resolveSecret(),
  pages: {
    signIn: '/auth/signin',
  },
  callbacks: {
    /**
     * Prevent disabled users from signing in via OAuth providers.
     * Credentials login is already checked in `authorize`, but OAuth tokens
     * can persist across sessions — this gate ensures a disabled OAuth user
     * cannot re-authenticate.
     */
    async signIn({ user, account }) {
      // Credentials login: `authorize` already checked `user.disabled`.
      if (account?.provider === 'credentials') return true;
      // OAuth login: re-verify the user is still active.
      if (user.id) {
        const db = getDb();
        const dbUser = db.select().from(users).where(eq(users.id, user.id)).get();
        if (!dbUser || dbUser.disabled) return false;
      }
      return true;
    },
    /**
     * Inject the user's role and id into the JWT so the session callback can
     * surface them to the client without an extra DB hit on every request.
     *
     * On `trigger: 'update'` (used when an admin changes a user's role),
     * re-read the `disabled` and `role` fields from the DB so the session
     * reflects changes immediately — no need to wait for the JWT to expire.
     */
    async jwt({ token, user, trigger }) {
      if (trigger === 'update' && token.id) {
        // Refresh disabled/role from DB so admin changes take effect instantly.
        const db = getDb();
        const dbUser = db.select({ disabled: users.disabled, role: users.role })
          .from(users).where(eq(users.id, token.id as string)).get();
        if (!dbUser || dbUser.disabled) {
          // User was disabled or deleted — return empty token to force logout.
          return {};
        }
        token.role = dbUser.role;
      }
      // On first sign-in (user is defined), persist id + role from the DB.
      if (user) {
        token.id = user.id;
        token.role = (user as { role?: Role }).role ?? 'user';
      }
      return token;
    },
    /**
     * Expose id + role on session.user so both server and client code can
     * read them via useSession() / getServerSession().
     */
    async session({ session, token }) {
      if (session.user) {
        (session.user as { id?: string }).id = token.id as string;
        (session.user as { role?: Role }).role = (token.role as Role) ?? 'user';
      }
      return session;
    },
  },
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const db = getDb();
        const user = db
          .select()
          .from(users)
          .where(eq(users.email, credentials.email.toLowerCase()))
          .get();

        if (!user || user.disabled) return null;

        // The first user to sign up via credentials has no password hash yet
        // if they were created via OAuth. Reject credential login in that case.
        if (!user.passwordHash) return null;

        const valid = await verifyPassword(credentials.password, user.passwordHash);
        if (!valid) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name ?? undefined,
          image: user.image ?? undefined,
          role: user.role,
        };
      },
    }),
    // OAuth providers are conditionally added so missing env vars don't crash.
    ...(process.env.GITHUB_ID && process.env.GITHUB_SECRET
      ? [
          GitHubProvider({
            clientId: process.env.GITHUB_ID,
            clientSecret: process.env.GITHUB_SECRET,
          }),
        ]
      : []),
    ...(process.env.GOOGLE_ID && process.env.GOOGLE_SECRET
      ? [
          GoogleProvider({
            clientId: process.env.GOOGLE_ID,
            clientSecret: process.env.GOOGLE_SECRET,
          }),
        ]
      : []),
    // Enterprise SSO providers (OIDC + SAML) — conditionally added.
    ...getSsoProviders(),
  ],
};

/**
 * Create a new user with email + password (credentials sign-up).
 * Used by the /api/auth/signup route.
 *
 * - Lowercases and trims the email.
 * - Hashes the password with bcrypt.
 * - Assigns the `user` role.
 * - Throws on duplicate email.
 */
export async function createUserWithCredentials(
  email: string,
  password: string,
  name?: string,
): Promise<{ id: string; email: string; role: Role }> {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail || !password) {
    throw new Error('Email and password are required');
  }
  if (password.length < 8) {
    throw new Error('Password must be at least 8 characters');
  }

  const db = getDb();
  const existing = db.select().from(users).where(eq(users.email, normalizedEmail)).get();
  if (existing) {
    throw new Error('A user with this email already exists');
  }

  const passwordHash = await hashPassword(password);
  const created = db
    .insert(users)
    .values({
      email: normalizedEmail,
      name: name?.trim() || null,
      passwordHash,
      role: 'user',
    })
    .returning()
    .get();

  return { id: created.id, email: created.email, role: created.role };
}

/**
 * Look up a user by their linked OAuth account (provider + providerAccountId).
 * Used to sign in existing OAuth users on first callback.
 */
export function findUserByOAuthAccount(
  provider: string,
  providerAccountId: string,
): { id: string; email: string; name: string | null; role: Role } | null {
  const db = getDb();
  const account = db
    .select()
    .from(accounts)
    .where(
      and(eq(accounts.provider, provider), eq(accounts.providerAccountId, providerAccountId)),
    )
    .get();
  if (!account) return null;

  const user = db.select().from(users).where(eq(users.id, account.userId)).get();
  if (!user || user.disabled) return null;

  return { id: user.id, email: user.email, name: user.name, role: user.role };
}

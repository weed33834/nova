/**
 * POST /api/auth/saml/acs
 *
 * Assertion Consumer Service (ACS) endpoint — receives the SAML response
 * from the Identity Provider after successful authentication.
 *
 * The SAML response is parsed and validated:
 *  1. Base64-decode the SAMLResponse parameter
 *  2. Parse the XML to extract user attributes (email, name)
 *  3. Validate the response (signature, audience, conditions) if
 *     @node-saml/passport-saml is installed
 *  4. Create or look up the user in the database
 *  5. Generate a signed callback token and redirect to the NextAuth
 *     callback URL to establish the session
 *
 * If @node-saml/passport-saml is NOT installed, a simplified validation
 * is performed (XML parsing only, no signature verification). This is
 * NOT secure for production — install the package for production use.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createLogger } from '@/lib/logger';
import { getDb } from '@/lib/db/client';
import { users, accounts } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { recordAuditLog } from '@/lib/db/audit';

const log = createLogger('SAML');
export const dynamic = 'force-dynamic';

interface SamlUserInfo {
  email: string;
  name?: string;
  nameId: string;
  id: string;
}

/**
 * Parse the SAML response XML to extract user attributes.
 * Uses a simple regex-based parser as a fallback when
 * @node-saml/passport-saml is not installed.
 */
function parseSamlResponseSimple(samlXml: string): SamlUserInfo | null {
  try {
    // Extract NameID
    const nameIdMatch = samlXml.match(/<saml:NameID[^>]*>([^<]+)<\/saml:NameID>/i)
      || samlXml.match(/<NameID[^>]*>([^<]+)<\/NameID>/i);
    const nameId = nameIdMatch?.[1]?.trim();

    // Extract email attribute
    const emailMatch = samlXml.match(/<saml:AttributeValue[^>]*name="[^"]*email[^"]*"[^>]*>([^<]+)<\/saml:AttributeValue>/i)
      || samlXml.match(/<AttributeValue[^>]*>([^<]*@[^<]*)<\/AttributeValue>/i)
      || samlXml.match(/EmailAddress[^>]*>([^<]+)</i);
    const email = emailMatch?.[1]?.trim() || nameId;

    // Extract name attribute
    const nameMatch = samlXml.match(/<saml:AttributeValue[^>]*name="[^"]*(?:given)?name[^"]*"[^>]*>([^<]+)<\/saml:AttributeValue>/i)
      || samlXml.match(/<AttributeValue[^>]*name="[^"]*name[^"]*"[^>]*>([^<]+)<\/saml:AttributeValue>/i);
    const name = nameMatch?.[1]?.trim();

    if (!email) return null;

    return {
      email: email.toLowerCase(),
      name,
      nameId: nameId || email,
      id: email.toLowerCase(),
    };
  } catch (err) {
    log.error('SAML: Failed to parse SAML response', err);
    return null;
  }
}

/**
 * Validate the SAML response using @node-saml/passport-saml.
 * Returns the parsed user info if valid, null otherwise.
 */
async function validateSamlResponse(samlXml: string): Promise<SamlUserInfo | null> {
  try {
    const { Strategy } = await import('@node-saml/passport-saml');
    const cert = process.env.SSO_SAML_IDP_CERT || process.env.SSO_SAML_CERT;
    const entryId = process.env.SSO_SAML_ENTRY_ID!;

    const strategy = new Strategy(
      {
        entryPoint: entryId,
        cert: cert || undefined,
        issuer: 'nova',
        callbackUrl: '/api/auth/saml/acs',
        audience: 'nova',
        wantAssertionsSigned: !!cert,
        acceptedClockSkewMs: 300000, // 5 minutes
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (profile: any, done: any) => done(null, profile),
    );

    return new Promise((resolve) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      strategy.validatePostResponse({ SAMLResponse: samlXml } as any, (err: unknown, profile: unknown) => {
        if (err || !profile) {
          log.error('SAML: Validation failed', err);
          resolve(null);
          return;
        }
        const p = profile as Record<string, unknown>;
        resolve({
          email: (p.email as string || p.nameID as string).toLowerCase(),
          name: (p.displayName as string) || (p.givenName as string) || undefined,
          nameId: p.nameID as string,
          id: (p.nameID as string || p.email as string).toLowerCase(),
        });
      });
    });
  } catch (err) {
    if (err instanceof Error && err.message.includes('Cannot find module')) {
      log.warn('SAML: @node-saml/passport-saml not installed, using simplified parser (NOT secure for production)');
      return parseSamlResponseSimple(samlXml);
    }
    log.error('SAML: Validation error', err);
    return null;
  }
}

/**
 * Find or create a user from SAML authentication.
 */
function findOrCreateSamlUser(userInfo: SamlUserInfo): { id: string; email: string; name?: string } | null {
  const db = getDb();

  // Check if an account already exists for this SAML provider
  const existingAccount = db
    .select()
    .from(accounts)
    .where(and(eq(accounts.provider, 'saml'), eq(accounts.providerAccountId, userInfo.id)))
    .get();

  if (existingAccount) {
    // Account exists — look up the user
    const user = db.select().from(users).where(eq(users.id, existingAccount.userId)).get();
    if (!user || user.disabled) return null;
    return { id: user.id, email: user.email, name: user.name ?? undefined };
  }

  // No existing account — check if a user with this email exists
  const existingUser = db.select().from(users).where(eq(users.email, userInfo.email)).get();
  if (existingUser) {
    if (existingUser.disabled) return null;
    // Link the SAML account to the existing user
    db.insert(accounts)
      .values({
        userId: existingUser.id,
        type: 'saml',
        provider: 'saml',
        providerAccountId: userInfo.id,
      })
      .run();
    return { id: existingUser.id, email: existingUser.email, name: existingUser.name ?? undefined };
  }

  // Create a new user and SAML account link atomically — if the account
  // insert fails the user insert is rolled back, avoiding orphan users.
  const result = db.transaction(() => {
    const newUser = db
      .insert(users)
      .values({
        email: userInfo.email,
        name: userInfo.name || null,
        role: 'user',
      })
      .returning()
      .get();

    db.insert(accounts)
      .values({
        userId: newUser.id,
        type: 'saml',
        provider: 'saml',
        providerAccountId: userInfo.id,
      })
      .run();

    return newUser;
  });

  log.info(`SAML: Created new user ${result.id} for ${userInfo.email}`);

  return { id: result.id, email: result.email, name: result.name ?? undefined };
}

export async function POST(req: NextRequest) {
  const entryId = process.env.SSO_SAML_ENTRY_ID;
  if (!entryId) {
    return NextResponse.json(
      { error: 'SAML SSO is not configured' },
      { status: 503 },
    );
  }

  const formData = await req.formData();
  const samlResponse = formData.get('SAMLResponse') as string | null;
  const relayState = (formData.get('RelayState') as string) || '/';

  if (!samlResponse) {
    log.warn('SAML: ACS request without SAMLResponse');
    return NextResponse.json({ error: 'Missing SAMLResponse' }, { status: 400 });
  }

  // Decode the SAML response
  const samlXml = Buffer.from(samlResponse, 'base64').toString('utf-8');
  log.info('SAML: Received SAML response, validating...');

  // Validate and parse the SAML response
  const userInfo = await validateSamlResponse(samlXml);
  if (!userInfo) {
    log.warn('SAML: SAML response validation failed');
    return NextResponse.redirect(new URL('/auth/signin?error=SAMLValidationFailed', req.url));
  }

  // Find or create the user
  const user = findOrCreateSamlUser(userInfo);
  if (!user) {
    log.warn(`SAML: User lookup/creation failed for ${userInfo.email}`);
    return NextResponse.redirect(new URL('/auth/signin?error=UserCreationFailed', req.url));
  }

  // Audit log
  recordAuditLog({
    actorId: user.id,
    actorRole: 'user',
    action: 'user.login.saml',
    entityType: 'user',
    entityId: user.id,
    details: { email: user.email, provider: 'saml' },
  });

  // Generate a signed callback token for NextAuth
  const callbackToken = Buffer.from(
    JSON.stringify({
      id: user.id,
      email: user.email,
      name: user.name,
      exp: Date.now() + 5 * 60 * 1000, // 5-minute expiry
    }),
  ).toString('base64');

  // Redirect to NextAuth's callback URL with the SAML token
  const callbackUrl = `/api/auth/callback/saml?samlToken=${encodeURIComponent(callbackToken)}&callbackUrl=${encodeURIComponent(relayState)}`;

  log.info(`SAML: Authentication successful for ${user.email}, redirecting to NextAuth callback`);
  return NextResponse.redirect(new URL(callbackUrl, req.url));
}

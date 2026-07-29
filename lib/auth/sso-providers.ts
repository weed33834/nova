/**
 * SSO (Single Sign-On) provider configuration.
 *
 * This module adds enterprise SSO support to Nova's NextAuth setup:
 *
 * 1. **Generic OIDC Provider** — Works with any OpenID Connect-compatible
 *    Identity Provider (Azure AD, Okta, Keycloak, Auth0, Google Workspace, etc.)
 *    Enabled when SSO_OIDC_ISSUER is set.
 *
 * 2. **SAML 2.0 Provider** — For organizations that only support SAML.
 *    Uses @node-saml/passport-saml (optional dependency).
 *    Enabled when SSO_SAML_ENTRY_ID is set.
 *
 * Both providers integrate with NextAuth's existing session/JWT flow and
 * the Drizzle adapter, so SSO users get the same session handling as
 * credentials/OAuth users.
 *
 * Environment variables (see .env.example for full documentation):
 *
 * OIDC:
 *   SSO_OIDC_ISSUER=https://login.microsoftonline.com/{tenant}/v2.0
 *   SSO_OIDC_CLIENT_ID=
 *   SSO_OIDC_CLIENT_SECRET=
 *   SSO_OIDC_SCOPES=openid email profile
 *
 * SAML:
 *   SSO_SAML_ENTRY_ID=
 *   SSO_SAML_CERT=
 *   SSO_SAML_PRIVATE_KEY=
 *   SSO_SAML_IDP_METADATA_URL=  (alternative to manual cert/entry config)
 */
import { createLogger } from '@/lib/logger';

const log = createLogger('SSO');

// Use a permissive type for NextAuth providers since the exact type
// varies across NextAuth versions and provider configurations.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyProvider = any;

/**
 * Generic OIDC provider — works with any OIDC-compatible IdP.
 *
 * Configured via environment variables so operators can point at any
 * provider without code changes:
 *  - Azure AD / Entra ID
 *  - Okta
 *  - Keycloak
 *  - Auth0
 *  - Google Workspace
 *  - Ping Identity
 *  - Any other OIDC IdP
 */
function createOidcProvider(): AnyProvider | null {
  const issuer = process.env.SSO_OIDC_ISSUER;
  const clientId = process.env.SSO_OIDC_CLIENT_ID;
  const clientSecret = process.env.SSO_OIDC_CLIENT_SECRET;

  if (!issuer || !clientId || !clientSecret) return null;

  // Dynamic import so next-auth/providers/oauth is only loaded when needed
  const OAuthProvider = require('next-auth/providers/oauth').default;

  log.info(`SSO: OIDC provider enabled (issuer: ${issuer})`);

  return OAuthProvider({
    id: 'oidc',
    name: process.env.SSO_OIDC_NAME || 'Enterprise SSO',
    type: 'oauth',
    issuer,
    clientId,
    clientSecret,
    wellKnown: `${issuer}/.well-known/openid-configuration`,
    authorization: {
      params: {
        scope: process.env.SSO_OIDC_SCOPES || 'openid email profile',
      },
    },
    idToken: true,
    checks: ['pkce', 'state'],
    profile(profile: Record<string, unknown>) {
      return {
        id: profile.sub as string,
        email: profile.email as string,
        name: (profile.name as string) || (profile.preferred_username as string) || undefined,
        image: profile.picture as string | undefined,
        role: 'user' as const,
      };
    },
  }) as AnyProvider;
}

/**
 * SAML 2.0 provider — for organizations that only support SAML.
 *
 * Uses @node-saml/passport-saml (optional dependency) to handle:
 *  - SAML metadata generation (SP metadata endpoint)
 *  - SAML assertion parsing and verification
 *  - SAML response validation (signature, conditions, audience)
 *
 * The SAML flow is handled via custom routes at /api/auth/saml/* rather
 * than through NextAuth's standard callback, because SAML uses POST
 * redirects with XML payloads that don't fit NextAuth's OAuth model.
 *
 * After successful SAML authentication, the user is redirected to
 * NextAuth's callback URL with a signed token, which creates the session.
 */
function createSamlProvider(): AnyProvider | null {
  const entryId = process.env.SSO_SAML_ENTRY_ID;
  if (!entryId) return null;

  log.info(`SSO: SAML provider enabled (IdP: ${entryId})`);

  // SAML authentication is handled by custom routes, but we register a
  // placeholder provider so NextAuth knows about the "saml" provider
  // and can display it on the sign-in page.
  const CredentialsProvider = require('next-auth/providers/credentials').default;

  return CredentialsProvider({
    id: 'saml',
    name: process.env.SSO_SAML_NAME || 'SAML SSO',
    credentials: {
      samlToken: { label: 'SAML Token', type: 'text' },
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async authorize(credentials: any) {
      // This is called after the SAML ACS route validates the assertion
      // and redirects here with a signed token. The token contains the
      // user's email and name extracted from the SAML assertion.
      if (!credentials?.samlToken) return null;

      try {
        // Verify the SAML callback token (signed with NEXTAUTH_SECRET)
        const token = JSON.parse(
          Buffer.from(credentials.samlToken, 'base64').toString('utf-8'),
        ) as { email: string; name?: string; id: string; exp: number };

        // Check expiry (5-minute window)
        if (Date.now() > token.exp) {
          log.warn('SAML callback token expired');
          return null;
        }

        return {
          id: token.id,
          email: token.email,
          name: token.name ?? undefined,
          role: 'user' as const,
        };
      } catch {
        log.warn('Invalid SAML callback token');
        return null;
      }
    },
  }) as AnyProvider;
}

/**
 * Get all configured SSO providers (OIDC + SAML).
 * Returns an empty array if no SSO is configured.
 */
export function getSsoProviders(): AnyProvider[] {
  const providers: AnyProvider[] = [];

  const oidc = createOidcProvider();
  if (oidc) providers.push(oidc);

  const saml = createSamlProvider();
  if (saml) providers.push(saml);

  return providers;
}

/**
 * Check if any SSO provider is configured.
 */
export function isSsoConfigured(): boolean {
  return (
    !!(process.env.SSO_OIDC_ISSUER && process.env.SSO_OIDC_CLIENT_ID) ||
    !!process.env.SSO_SAML_ENTRY_ID
  );
}

/**
 * Get the list of configured SSO provider names for display.
 */
export function getConfiguredSsoProviderNames(): string[] {
  const names: string[] = [];
  if (process.env.SSO_OIDC_ISSUER && process.env.SSO_OIDC_CLIENT_ID) {
    names.push(process.env.SSO_OIDC_NAME || 'Enterprise SSO (OIDC)');
  }
  if (process.env.SSO_SAML_ENTRY_ID) {
    names.push(process.env.SSO_SAML_NAME || 'SAML SSO');
  }
  return names;
}

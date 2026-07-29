/**
 * Ambient type declarations for the optional @node-saml/passport-saml dependency.
 *
 * This package is only needed when SSO_SAML_ENTRY_ID is set for SAML SSO.
 * It is not installed by default, so TypeScript needs these minimal
 * declarations to compile the dynamic import in app/api/auth/saml/acs/route.ts.
 *
 * When the package IS installed, its real type declarations take precedence.
 */

declare module '@node-saml/passport-saml' {
  export interface SamlConfig {
    entryPoint: string;
    cert?: string;
    issuer: string;
    callbackUrl: string;
    audience?: string;
    wantAssertionsSigned?: boolean;
    acceptedClockSkewMs?: number;
    [key: string]: unknown;
  }

  export class Strategy {
    constructor(
      config: SamlConfig,
      verify: (profile: unknown, done: (err: unknown, user: unknown) => void) => void,
    );
    validatePostResponse(
      samlResponse: { SAMLResponse: string },
      callback: (err: unknown, profile: unknown, conditions?: unknown) => void,
    ): void;
  }
}

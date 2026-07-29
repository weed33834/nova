/**
 * GET /api/auth/saml/login
 *
 * Initiates the SAML SSO flow by generating a SAML AuthnRequest and
 * redirecting the user to the Identity Provider's SSO URL.
 *
 * Requires SSO_SAML_ENTRY_ID to be configured.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createLogger } from '@/lib/logger';

const log = createLogger('SAML');
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const entryId = process.env.SSO_SAML_ENTRY_ID;
  if (!entryId) {
    return NextResponse.json(
      { error: 'SAML SSO is not configured. Set SSO_SAML_ENTRY_ID.' },
      { status: 503 },
    );
  }

  const baseUrl = process.env.NEXTAUTH_URL || new URL(req.url).origin;
  const entityId = `${baseUrl}/api/auth/saml`;
  const acsUrl = `${baseUrl}/api/auth/saml/acs`;

  // Generate a unique request ID for the SAML request
  const requestId = crypto.randomUUID();

  // Build the SAML AuthnRequest XML
  const samlRequest = `<samlp:AuthnRequest xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" ID="_${requestId}" Version="2.0" IssueInstant="${new Date().toISOString()}" Destination="${entryId}" ProtocolBinding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST" AssertionConsumerServiceURL="${acsUrl}">
  <saml:Issuer xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion">${entityId}</saml:Issuer>
  <samlp:NameIDPolicy Format="urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress" AllowCreate="true" />
</samlp:AuthnRequest>`;

  // Base64-encode the request for the redirect binding
  const encodedRequest = Buffer.from(samlRequest).toString('base64');

  // Determine the IdP SSO URL (redirect binding)
  // If SSO_SAML_IDP_SSO_URL is set, use it directly
  // Otherwise, use the entry ID as the SSO URL (common for simple setups)
  const idpSsoUrl = process.env.SSO_SAML_IDP_SSO_URL || entryId;

  const redirectUrl = `${idpSsoUrl}?SAMLRequest=${encodeURIComponent(encodedRequest)}&RelayState=${encodeURIComponent('/')}`;

  log.info(`SAML: Redirecting to IdP for authentication (request ID: ${requestId})`);

  return NextResponse.redirect(redirectUrl);
}

/**
 * GET /api/auth/saml/metadata
 *
 * Returns the Service Provider (SP) SAML metadata XML.
 * This is registered with the Identity Provider (IdP) to establish trust.
 *
 * The metadata includes:
 *  - Entity ID (the app's base URL)
 *  - ACS endpoint URL (where the IdP sends SAML responses)
 *  - SLO endpoint URL (optional, for single logout)
 *  - Signing certificate (the SP's public key)
 */
import { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const baseUrl = process.env.NEXTAUTH_URL || new URL(req.url).origin;
  const entityId = `${baseUrl}/api/auth/saml`;
  const acsUrl = `${baseUrl}/api/auth/saml/acs`;
  const sloUrl = `${baseUrl}/api/auth/saml/slo`;

  // The SP certificate is the public key corresponding to SSO_SAML_PRIVATE_KEY.
  // In production, this should be set via SSO_SAML_CERT.
  const cert = (process.env.SSO_SAML_CERT || '').replace(/-----BEGIN CERTIFICATE-----/g, '').replace(/-----END CERTIFICATE-----/g, '').replace(/\s/g, '');

  const metadata = `<?xml version="1.0" encoding="UTF-8"?>
<EntityDescriptor xmlns="urn:oasis:names:tc:SAML:2.0:metadata" entityID="${entityId}">
  <SPSSODescriptor protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
    <NameIDFormat>urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress</NameIDFormat>
    <NameIDFormat>urn:oasis:names:tc:SAML:1.1:nameid-format:unspecified</NameIDFormat>
    <AssertionConsumerService index="0" isDefault="true"
      Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST"
      Location="${acsUrl}" />
    <SingleLogoutService index="0"
      Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST"
      Location="${sloUrl}" />${cert ? `
    <KeyDescriptor use="signing">
      <KeyInfo xmlns="http://www.w3.org/2000/09/xmldsig#">
        <X509Data>
          <X509Certificate>${cert}</X509Certificate>
        </X509Data>
      </KeyInfo>
    </KeyDescriptor>` : ''}
  </SPSSODescriptor>
</EntityDescriptor>`;

  return new Response(metadata, {
    headers: {
      'Content-Type': 'application/xml',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}

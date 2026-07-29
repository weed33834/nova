import { NextResponse } from 'next/server';

/** GET /api/docs-ui — Interactive Scalar API documentation */
export async function GET() {
  const html = `<!DOCTYPE html>
<html>
<head>
  <title>Nova API Documentation</title>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@scalar/api-reference@1/dist/style.css" />
</head>
<body>
  <noscript>Scalar API Reference requires JavaScript to run.</noscript>
  <script id="api-reference" data-url="/api/docs"></script>
  <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference@1"></script>
</body>
</html>`;

  return new NextResponse(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

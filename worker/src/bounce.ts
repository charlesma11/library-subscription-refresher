function escape(s: string): string {
  return s
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function bounceHtml(redeemUrl: string, nextUrl: string): string {
  const safeRedeem = escape(redeemUrl);
  const safeNext = escape(nextUrl);
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>Refreshing NYT library pass…</title>
  <meta http-equiv="refresh" content="0;url=${safeRedeem}">
  <style>
    body { font-family: -apple-system, system-ui, sans-serif; max-width: 480px; margin: 48px auto; padding: 0 24px; color: #222; }
    a { color: #326891; }
  </style>
</head>
<body>
  <h1>Redeeming your NYT library pass…</h1>
  <p>You should be automatically redirected. If not, <a href="${safeNext}">continue to your article</a>.</p>
</body>
</html>`;
}

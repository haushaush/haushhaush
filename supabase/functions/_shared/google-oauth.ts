// Google OAuth client credentials come ONLY from secrets. No table fallback.
export function googleOAuthCreds(): { clientId: string; clientSecret: string } {
  const clientId = Deno.env.get("GOOGLE_OAUTH_CLIENT_ID")?.trim();
  const clientSecret = Deno.env.get("GOOGLE_OAUTH_CLIENT_SECRET")?.trim();
  if (!clientId) throw new Error("Secret GOOGLE_OAUTH_CLIENT_ID fehlt");
  if (!clientSecret) throw new Error("Secret GOOGLE_OAUTH_CLIENT_SECRET fehlt");
  return { clientId, clientSecret };
}

export function googleOAuthClientId(): string {
  const clientId = Deno.env.get("GOOGLE_OAUTH_CLIENT_ID")?.trim();
  if (!clientId) throw new Error("Secret GOOGLE_OAUTH_CLIENT_ID fehlt");
  return clientId;
}

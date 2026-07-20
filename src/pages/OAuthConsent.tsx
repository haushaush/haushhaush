import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Loader2, ShieldCheck } from "lucide-react";

/**
 * OAuth 2.1 consent screen for the Lovable-managed Supabase authorization server.
 * URL: /.lovable/oauth/consent?authorization_id=...
 * Used e.g. when Claude/Cowork connects to `claude-meta-mcp`.
 */
// Types for the beta supabase.auth.oauth namespace — kept local so TS is happy.
type OAuthNS = {
  getAuthorizationDetails: (id: string) => Promise<{ data: any; error: any }>;
  approveAuthorization: (id: string) => Promise<{ data: any; error: any }>;
  denyAuthorization: (id: string) => Promise<{ data: any; error: any }>;
};
function oauthNs(): OAuthNS {
  return (supabase.auth as unknown as { oauth: OAuthNS }).oauth;
}

export default function OAuthConsent() {
  const [params] = useSearchParams();
  const authorizationId = params.get("authorization_id") ?? "";
  const [details, setDetails] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!authorizationId) {
        setError("Fehlende authorization_id in der URL.");
        setLoading(false);
        return;
      }
      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session) {
        const next = window.location.pathname + window.location.search;
        window.location.href = "/auth?next=" + encodeURIComponent(next);
        return;
      }
      try {
        const { data, error } = await oauthNs().getAuthorizationDetails(authorizationId);
        if (!active) return;
        if (error) {
          setError(error.message ?? "Autorisierungsanfrage konnte nicht geladen werden.");
          setLoading(false);
          return;
        }
        const immediate = data?.redirect_url ?? data?.redirect_to;
        if (immediate && !data?.client) {
          window.location.href = immediate;
          return;
        }
        setDetails(data);
      } catch (e: any) {
        setError(e?.message ?? "Autorisierungsanfrage konnte nicht geladen werden.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [authorizationId]);

  async function decide(approve: boolean) {
    setBusy(true);
    setError(null);
    try {
      const ns = oauthNs();
      const { data, error } = approve
        ? await ns.approveAuthorization(authorizationId)
        : await ns.denyAuthorization(authorizationId);
      if (error) {
        setError(error.message ?? "Aktion fehlgeschlagen.");
        setBusy(false);
        return;
      }
      const target = data?.redirect_url ?? data?.redirect_to;
      if (!target) {
        setError("Der Autorisierungsserver hat keine Weiterleitung zurückgegeben.");
        setBusy(false);
        return;
      }
      window.location.href = target;
    } catch (e: any) {
      setError(e?.message ?? "Aktion fehlgeschlagen.");
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-background">
        <div className="w-full max-w-[440px] border border-border rounded-2xl p-8 bg-card">
          <h1 className="text-xl font-semibold mb-2">Autorisierung nicht möglich</h1>
          <p className="text-sm text-muted-foreground">{error}</p>
        </div>
      </div>
    );
  }

  const clientName = details?.client?.client_name ?? details?.client?.name ?? "Externer Client";
  const redirectUri = details?.client?.redirect_uris?.[0] ?? details?.redirect_uri ?? null;
  const scopes: string[] = (details?.scopes ?? details?.requested_scopes ?? String(details?.scope ?? "").split(/\s+/))
    .filter(Boolean);

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <div className="w-full max-w-[460px] border border-border rounded-2xl p-8 bg-card space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
            <ShieldCheck className="w-5 h-5 text-foreground" />
          </div>
          <div>
            <h1 className="text-lg font-semibold leading-tight">{clientName} verbinden</h1>
            <p className="text-xs text-muted-foreground">mit Agency Hub</p>
          </div>
        </div>

        <p className="text-sm text-foreground">
          <strong>{clientName}</strong> darf danach die freigegebenen Tools dieser App aufrufen,
          solange du eingeloggt bist.
        </p>

        {redirectUri && (
          <div className="text-xs text-muted-foreground border border-border rounded-lg p-3 break-all">
            <div className="uppercase tracking-wide mb-1 opacity-70">Weiterleitung</div>
            {redirectUri}
          </div>
        )}

        {scopes.length > 0 && (
          <div className="text-xs">
            <div className="uppercase tracking-wide mb-2 text-muted-foreground">Angefragte Berechtigungen</div>
            <ul className="space-y-1">
              {scopes.map((s) => (
                <li key={s} className="text-foreground">
                  {s === "openid" && "Identität bestätigen"}
                  {s === "email" && "E-Mail-Adresse teilen"}
                  {s === "profile" && "Profil-Basisdaten teilen"}
                  {!["openid","email","profile"].includes(s) && `Zusätzliche Berechtigung: ${s}`}
                </li>
              ))}
            </ul>
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          Dies umgeht keine App-Berechtigungen oder Backend-Regeln. Der Client agiert im Rahmen deines Kontos.
        </p>

        <div className="flex gap-2 pt-2">
          <Button variant="outline" className="flex-1" disabled={busy} onClick={() => decide(false)}>
            Ablehnen
          </Button>
          <Button className="flex-1" disabled={busy} onClick={() => decide(true)}>
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Erlauben"}
          </Button>
        </div>
      </div>
    </div>
  );
}

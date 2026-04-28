import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Mail,
  RefreshCw,
  ChevronDown,
  Plus,
  Settings,
  Reply,
  Forward,
  Trash2,
  Paperclip,
  Loader2,
  Inbox,
  Folder,
  ExternalLink,
  AlertCircle,
  ListChecks,
  Users,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import DOMPurify from 'dompurify';
import { AddAccountModal } from '@/components/email/AddAccountModal';
import { AccountsModal } from '@/components/email/AccountsModal';
import { ComposeModal } from '@/components/email/ComposeModal';
import { EmailSummaryPanel } from '@/components/email/EmailSummaryPanel';
import {
  EmailRouteSlug,
  ROUTE_CONFIGS,
  resolveFolderPath,
  isFolderMissing,
  emailColorFromAddress,
  senderInitials,
  formatEmailDate,
} from '@/lib/email/folders';

type EmailAccount = {
  id: string;
  email_address: string;
  display_name: string | null;
  provider: string | null;
  is_default: boolean;
  is_active: boolean;
  imap_host: string;
  imap_port: number;
  imap_secure: boolean;
  imap_user: string;
  smtp_host: string | null;
  smtp_port: number | null;
  smtp_secure: boolean | null;
  last_test_status: string | null;
};

type Mailbox = {
  path: string;
  name: string;
  specialUse: string | null;
  messageCount: number | null;
  unreadCount: number | null;
};

type CachedMessage = {
  id: string;
  account_id: string;
  folder: string;
  uid: number;
  subject: string | null;
  from_address: string | null;
  from_name: string | null;
  to_addresses: string[] | null;
  date: string | null;
  flags: string[] | null;
  has_attachment: boolean | null;
  snippet: string | null;
};

type FullMessage = CachedMessage & {
  body_text: string | null;
  body_html: string | null;
  body_fetched_at: string | null;
  attachments: Array<{ filename: string; size: number; contentType: string; attachmentId: number }> | null;
};

function isUnread(flags: string[] | null): boolean {
  return !(flags ?? []).includes('\\Seen');
}

function formatBytes(bytes: number): string {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

const SLUG_TO_ROUTE: Record<string, EmailRouteSlug> = {
  posteingang: 'posteingang',
  ungelesen: 'ungelesen',
  gesendet: 'gesendet',
  wichtig: 'wichtig',
  entwuerfe: 'entwuerfe',
  papierkorb: 'papierkorb',
};

interface EmailPageProps {
  mode?: 'personal' | 'shared';
}

export default function EmailPage({ mode = 'personal' }: EmailPageProps) {
  const { slug: rawSlug } = useParams<{ slug?: string }>();
  const slug: EmailRouteSlug = (rawSlug && SLUG_TO_ROUTE[rawSlug]) || 'posteingang';
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Mode-aware table & edge function names
  const accountsTable = mode === 'shared' ? 'shared_email_accounts' : 'email_accounts';
  const fnPrefix = mode === 'shared' ? 'shared-imap' : 'imap';
  const basePath = mode === 'shared' ? '/email-automatisierung' : '/email';
  const queryNs = mode === 'shared' ? 'shared-email' : 'email';
  const downloadFnUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${fnPrefix}-download-attachment`;

  const [activeAccountId, setActiveAccountId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedUid, setSelectedUid] = useState<number | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [addPrefill, setAddPrefill] = useState<any>(null);
  const [accountsOpen, setAccountsOpen] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [composePrefill, setComposePrefill] = useState<{ to?: string[]; subject?: string; body?: string }>({});
  const [showImages, setShowImages] = useState(false);
  const [showRaw, setShowRaw] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  // Load accounts
  const accountsQuery = useQuery({
    queryKey: [`${queryNs}-accounts`, mode],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from(accountsTable)
        .select('*')
        .eq('is_active', true)
        .order('is_default', { ascending: false })
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as EmailAccount[];
    },
  });
  const accounts = accountsQuery.data ?? [];

  // Initialize active account
  useEffect(() => {
    if (!activeAccountId && accounts.length > 0) {
      const def = accounts.find((a) => a.is_default) ?? accounts[0];
      setActiveAccountId(def.id);
    }
  }, [accounts, activeAccountId]);

  const activeAccount = accounts.find((a) => a.id === activeAccountId) ?? null;

  // Load mailboxes
  const mailboxesQuery = useQuery({
    queryKey: [`${queryNs}-mailboxes`, mode, activeAccountId],
    enabled: !!activeAccountId,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke(`${fnPrefix}-list-mailboxes`, {
        body: { accountId: activeAccountId },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.message ?? 'Mailboxes konnten nicht geladen werden');
      return (data.folders ?? []) as Mailbox[];
    },
  });
  const mailboxes = mailboxesQuery.data ?? [];

  // Resolve current folder path from slug + mailboxes
  const folderPath = useMemo(() => {
    if (mailboxes.length === 0) return 'INBOX';
    return resolveFolderPath(slug, mailboxes);
  }, [slug, mailboxes]);

  const searchParam = useMemo<any>(() => {
    if (debouncedSearch) return { query: debouncedSearch };
    if (slug === 'ungelesen') return { unseen: true };
    if (slug === 'wichtig') return { flagged: true };
    return undefined;
  }, [debouncedSearch, slug]);

  const folderMissing = useMemo(
    () => mailboxes.length > 0 && isFolderMissing(slug, mailboxes),
    [slug, mailboxes],
  );

  // Load messages
  const messagesQuery = useQuery({
    queryKey: [`${queryNs}-messages`, mode, activeAccountId, folderPath, searchParam],
    enabled: !!activeAccountId && mailboxes.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke(`${fnPrefix}-list-messages`, {
        body: { accountId: activeAccountId, folder: folderPath, search: searchParam, limit: 50 },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.message ?? 'Nachrichten konnten nicht geladen werden');
      return (data.messages ?? []) as CachedMessage[];
    },
  });
  const messages = messagesQuery.data ?? [];

  // Load message detail — with explicit timeout & error surfacing
  const messageQuery = useQuery({
    queryKey: [`${queryNs}-message`, mode, activeAccountId, folderPath, selectedUid],
    enabled: !!activeAccountId && !!selectedUid,
    retry: 1,
    staleTime: Infinity,
    queryFn: async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 70_000);
      try {
        const invokePromise = supabase.functions.invoke(`${fnPrefix}-get-message`, {
          body: { accountId: activeAccountId, folder: folderPath, uid: selectedUid },
        });
        const timeoutPromise = new Promise<never>((_, reject) => {
          controller.signal.addEventListener('abort', () =>
            reject(new Error('Zeitüberschreitung – die E-Mail brauchte zu lange zum Laden.')),
          );
        });
        const { data, error } = (await Promise.race([invokePromise, timeoutPromise])) as Awaited<typeof invokePromise>;
        if (error) throw new Error(error.message ?? 'Edge function error');
        if (!data?.ok) throw new Error(data?.message ?? 'Nachricht konnte nicht geladen werden');
        return data.message as FullMessage;
      } finally {
        clearTimeout(timer);
      }
    },
  });
  const fullMessage = messageQuery.data;

  // Cross-link to close_deals
  const linkedDealQuery = useQuery({
    queryKey: ['email-deal-link', fullMessage?.from_address],
    enabled: !!fullMessage?.from_address,
    queryFn: async () => {
      const { data } = await supabase
        .from('close_deals')
        .select('id, client_name, vor_nachname')
        .eq('email', fullMessage!.from_address!)
        .maybeSingle();
      return data;
    },
  });

  // Mark as read on open
  useEffect(() => {
    const msg = messages.find((m) => m.uid === selectedUid);
    if (!msg || !activeAccountId || !isUnread(msg.flags)) return;
    supabase.functions.invoke(`${fnPrefix}-mark-read`, {
      body: { accountId: activeAccountId, folder: folderPath, uid: selectedUid, read: true },
    }).then(() => {
      queryClient.invalidateQueries({ queryKey: [`${queryNs}-messages`, mode, activeAccountId, folderPath, searchParam] });
      queryClient.invalidateQueries({ queryKey: [`${queryNs}-mailboxes`, mode, activeAccountId] });
    });
  }, [selectedUid]); // eslint-disable-line

  // Reset image-blocking on message change
  useEffect(() => {
    setShowImages(false);
    setShowRaw(false);
  }, [selectedUid]);

  // Determine which body to render — prefer HTML when meaningfully present
  const hasHtml = useMemo(
    () => !!fullMessage?.body_html && fullMessage.body_html.trim().length > 50,
    [fullMessage?.body_html],
  );

  // Debug log so we can spot rendering issues from the console
  useEffect(() => {
    if (!fullMessage) return;
    // eslint-disable-next-line no-console
    console.log(
      `[MessageDetail] uid=${fullMessage.uid} html=${fullMessage.body_html?.length ?? 0} text=${fullMessage.body_text?.length ?? 0}`,
    );
  }, [fullMessage?.uid, fullMessage?.body_html, fullMessage?.body_text]);

  // Sanitize HTML
  const sanitizedHtml = useMemo(() => {
    if (!hasHtml || !fullMessage?.body_html) return '';
    return DOMPurify.sanitize(fullMessage.body_html, {
      ALLOWED_TAGS: ['a', 'p', 'br', 'strong', 'em', 'u', 'ul', 'ol', 'li', 'table', 'tr', 'td', 'th', 'thead', 'tbody', 'img', 'div', 'span', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'pre', 'code', 'hr'],
      ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'style', 'target', 'rel', 'width', 'height'],
      FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form', 'input', 'button'],
      FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover'],
    });
  }, [hasHtml, fullMessage?.body_html]);

  const hasExternalImages = useMemo(() => {
    return /<img[^>]+src=['"]https?:/i.test(fullMessage?.body_html ?? '');
  }, [fullMessage?.body_html]);

  // Auto-linked plain-text fallback (URLs and email addresses become clickable)
  const linkedText = useMemo(() => {
    const raw = fullMessage?.body_text ?? '';
    if (!raw) return '';
    const escaped = raw.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const withUrls = escaped.replace(
      /(https?:\/\/[^\s<>"]+)/g,
      '<a href="$1" target="_blank" rel="noopener noreferrer" class="text-teal-600 underline">$1</a>',
    );
    const withEmails = withUrls.replace(
      /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g,
      '<a href="mailto:$1" class="text-teal-600 underline">$1</a>',
    );
    return withEmails;
  }, [fullMessage?.body_text]);


  const finalHtml = useMemo(() => {
    if (showImages || !hasExternalImages) return sanitizedHtml;
    return sanitizedHtml.replace(/<img[^>]*>/gi, '<span class="text-xs text-muted-foreground italic">[Bild blockiert]</span>');
  }, [sanitizedHtml, showImages, hasExternalImages]);

  // Force links to open in new tab
  useEffect(() => {
    if (!bodyRef.current) return;
    const links = bodyRef.current.querySelectorAll('a');
    links.forEach((a) => {
      a.setAttribute('target', '_blank');
      a.setAttribute('rel', 'noopener noreferrer');
    });
  }, [finalHtml]);

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: [`${queryNs}-messages`, mode, activeAccountId, folderPath, searchParam] });
    queryClient.invalidateQueries({ queryKey: [`${queryNs}-mailboxes`, mode, activeAccountId] });
  };

  const handleSelectFolder = (newSlug: EmailRouteSlug) => {
    setSelectedUid(null);
    if (newSlug === 'posteingang') navigate(basePath);
    else navigate(`${basePath}/${newSlug}`);
  };

  const handleReply = () => {
    if (!fullMessage) return;
    setComposePrefill({
      to: fullMessage.from_address ? [fullMessage.from_address] : [],
      subject: `Re: ${fullMessage.subject ?? ''}`.replace(/^Re:\s*Re:/i, 'Re:'),
      body: `\n\n---\nAm ${formatEmailDate(fullMessage.date)} schrieb ${fullMessage.from_name ?? fullMessage.from_address}:\n\n${fullMessage.body_text ?? ''}`,
    });
    setComposeOpen(true);
  };

  const handleForward = () => {
    if (!fullMessage) return;
    setComposePrefill({
      to: [],
      subject: `Fwd: ${fullMessage.subject ?? ''}`,
      body: `\n\n---------- Weitergeleitete Nachricht ----------\nVon: ${fullMessage.from_name ?? ''} <${fullMessage.from_address ?? ''}>\nDatum: ${formatEmailDate(fullMessage.date)}\nBetreff: ${fullMessage.subject ?? ''}\n\n${fullMessage.body_text ?? ''}`,
    });
    setComposeOpen(true);
  };

  const handleNewMail = () => {
    setComposePrefill({});
    setComposeOpen(true);
  };

  const downloadAttachment = async (attachmentId: number, filename: string) => {
    if (!activeAccountId || !selectedUid) return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const url = downloadFnUrl;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token ?? ''}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '',
        },
        body: JSON.stringify({ accountId: activeAccountId, folder: folderPath, uid: selectedUid, attachmentId }),
      });
      if (!res.ok) throw new Error('Download fehlgeschlagen');
      const blob = await res.blob();
      const dlUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = dlUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(dlUrl);
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  // System folders for left tree
  const systemSlugs: EmailRouteSlug[] = ['posteingang', 'ungelesen', 'gesendet', 'wichtig', 'entwuerfe', 'papierkorb'];

  // User folders (excluding system ones — system folders are detected by special-use OR name match)
  const userFolders = useMemo(() => {
    if (mailboxes.length === 0) return [];
    const reservedPaths = new Set<string>();
    (['posteingang', 'gesendet', 'entwuerfe', 'papierkorb'] as EmailRouteSlug[]).forEach((s) => {
      reservedPaths.add(resolveFolderPath(s, mailboxes));
    });
    reservedPaths.add('INBOX');
    const reservedSpecialUses = new Set(['\\Inbox', '\\Sent', '\\Drafts', '\\Trash', '\\Junk', '\\Archive']);
    return mailboxes.filter(
      (m) => !reservedPaths.has(m.path) && !reservedSpecialUses.has(m.specialUse ?? ''),
    );
  }, [mailboxes]);

  // ============= LOADING / NO ACCOUNTS STATE =============
  if (accountsQuery.isLoading) {
    return (
      <div className="h-[calc(100vh-4rem)] flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (accounts.length === 0) {
    return (
      <div className="h-[calc(100vh-4rem)] flex items-center justify-center">
        <div className="max-w-md text-center space-y-4 p-8">
          <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
            <Mail className="h-8 w-8 text-primary" />
          </div>
          <h2 className="text-xl font-semibold">Noch keine E-Mail-Konten verbunden</h2>
          <p className="text-sm text-muted-foreground">
            Füge dein erstes Konto hinzu, um deine E-Mails im Portal zu lesen.
          </p>
          <p className="text-xs text-muted-foreground">
            Unterstützte Provider: Gmail · Outlook · GMX · Web.de · IONOS · Strato · T-Online · all-inkl · Eigener IMAP-Server
          </p>
          <Button onClick={() => setAddOpen(true)} className="gap-2">
            <Plus className="h-4 w-4" /> E-Mail-Konto hinzufügen
          </Button>
        </div>
        <AddAccountModal
          open={addOpen}
          onClose={() => setAddOpen(false)}
          onAccountSaved={() => accountsQuery.refetch()}
          prefill={null}
          mode={mode}
        />
      </div>
    );
  }

  // ============= MAIN INBOX VIEW =============
  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col">
      {/* Top bar */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
        <div className="relative flex-1 max-w-md">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="E-Mails durchsuchen…"
            className="h-9"
          />
        </div>
        <Button variant="outline" size="sm" onClick={handleRefresh} className="gap-1">
          <RefreshCw className={cn('h-4 w-4', messagesQuery.isFetching && 'animate-spin')} />
          Aktualisieren
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setSummaryOpen(true)}
          className="gap-1 hover:text-primary hover:border-primary/50"
        >
          <ListChecks className="h-4 w-4" />
          Zusammenfassen
        </Button>
        <Button variant="default" size="sm" onClick={handleNewMail} className="gap-1">
          <Plus className="h-4 w-4" /> Neue E-Mail
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1 max-w-[260px]">
              <span className="truncate">{activeAccount?.email_address ?? 'Konto wählen'}</span>
              <ChevronDown className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-[260px]">
            <DropdownMenuLabel>Aktives Konto</DropdownMenuLabel>
            {accounts.map((a) => (
              <DropdownMenuItem
                key={a.id}
                onClick={() => { setActiveAccountId(a.id); setSelectedUid(null); }}
                className={cn(activeAccountId === a.id && 'bg-muted font-medium')}
              >
                <Mail className="h-3.5 w-3.5 mr-2" /> {a.email_address}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setAddOpen(true)}>
              <Plus className="h-3.5 w-3.5 mr-2" /> Konto hinzufügen
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setAccountsOpen(true)}>
              <Settings className="h-3.5 w-3.5 mr-2" /> Konten verwalten
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Three-column layout */}
      <div className="flex-1 grid grid-cols-[240px_420px_1fr] min-h-0">
        {/* LEFT: Mailbox tree */}
        <div className="border-r border-border overflow-y-auto py-2">
          <div className="px-3 pt-2 pb-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Ordner
          </div>
          {systemSlugs.map((s) => {
            const cfg = ROUTE_CONFIGS[s];
            const Icon = cfg.icon;
            const isActive = slug === s;
            const path = mailboxes.length > 0 ? resolveFolderPath(s, mailboxes) : 'INBOX';
            const mb = mailboxes.find((m) => m.path === path);
            const unread = s === 'posteingang' || s === 'ungelesen' ? mb?.unreadCount ?? 0 : 0;
            return (
              <button
                key={s}
                onClick={() => handleSelectFolder(s)}
                className={cn(
                  'w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted/60 transition-colors text-left',
                  isActive && 'bg-primary/10 text-primary font-medium border-l-2 border-primary',
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="flex-1 truncate">{cfg.label}</span>
                {unread > 0 && (
                  <span className="text-xs px-1.5 py-0.5 rounded bg-primary text-primary-foreground">{unread}</span>
                )}
              </button>
            );
          })}

          {userFolders.length > 0 && (
            <>
              <div className="px-3 pt-4 pb-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Meine Ordner
              </div>
              {userFolders.map((m) => (
                <div
                  key={m.path}
                  className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground"
                >
                  <Folder className="h-4 w-4 shrink-0" />
                  <span className="flex-1 truncate">{m.name}</span>
                  {(m.unreadCount ?? 0) > 0 && (
                    <span className="text-xs px-1.5 py-0.5 rounded bg-muted">{m.unreadCount}</span>
                  )}
                </div>
              ))}
            </>
          )}
        </div>

        {/* CENTER: Message list */}
        <div className="border-r border-border overflow-y-auto">
          {folderMissing && !messagesQuery.isLoading && (
            <div className="m-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
              <div className="flex-1">
                <div className="font-medium text-foreground">Ordner nicht verfügbar</div>
                <div className="text-muted-foreground mt-0.5">
                  „{ROUTE_CONFIGS[slug].label}" existiert nicht in diesem Konto. Es werden ersatzweise Posteingang-Nachrichten angezeigt.
                </div>
              </div>
            </div>
          )}
          {messagesQuery.isLoading && (
            <div className="p-8 flex justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}
          {messagesQuery.isError && (
            <div className="p-6 text-sm text-destructive">
              {(messagesQuery.error as Error).message}
            </div>
          )}
          {!messagesQuery.isLoading && messages.length === 0 && (
            <div className="p-8 text-center text-sm text-muted-foreground">
              <Inbox className="h-8 w-8 mx-auto mb-2 opacity-40" />
              Keine E-Mails in diesem Ordner
            </div>
          )}
          {messages.map((m) => {
            const unread = isUnread(m.flags);
            const selected = selectedUid === m.uid;
            return (
              <button
                key={m.uid}
                onClick={() => setSelectedUid(m.uid)}
                className={cn(
                  'w-full flex items-start gap-3 px-4 py-3 border-b border-border/60 hover:bg-muted/40 transition-colors text-left h-16',
                  selected && 'bg-primary/10',
                )}
              >
                <div className="w-1.5 self-stretch flex items-center justify-center shrink-0">
                  {unread && <div className="w-2 h-2 rounded-full bg-primary" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className={cn('text-sm truncate', unread ? 'font-semibold' : 'font-normal')}>
                      {m.from_name ?? m.from_address ?? 'Unbekannt'}
                    </span>
                    <span className="text-xs text-muted-foreground shrink-0 flex items-center gap-1">
                      {m.has_attachment && <Paperclip className="h-3 w-3" />}
                      {formatEmailDate(m.date)}
                    </span>
                  </div>
                  <div className={cn('text-xs truncate', unread ? 'text-foreground' : 'text-muted-foreground')}>
                    {m.subject || '(kein Betreff)'}
                  </div>
                  {m.snippet && (
                    <div className="text-xs text-muted-foreground/70 truncate">{m.snippet}</div>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {/* RIGHT: Message detail */}
        <div className="overflow-y-auto">
          {!selectedUid && (
            <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
              Wähle eine E-Mail aus der Liste
            </div>
          )}
          {selectedUid && messageQuery.isLoading && (
            <div className="h-full flex flex-col items-center justify-center gap-3">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">E-Mail wird geladen…</p>
            </div>
          )}
          {selectedUid && messageQuery.isError && !messageQuery.isLoading && (
            <div className="h-full flex flex-col items-center justify-center gap-3 p-6 text-center">
              <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center">
                <Mail className="h-6 w-6 text-destructive" />
              </div>
              <p className="text-sm font-medium">E-Mail konnte nicht geladen werden</p>
              <p className="text-xs text-muted-foreground max-w-sm">
                {(messageQuery.error as Error)?.message ?? 'Unbekannter Fehler'}
              </p>
              <Button size="sm" onClick={() => messageQuery.refetch()} className="gap-1">
                <RefreshCw className="h-3.5 w-3.5" /> Erneut versuchen
              </Button>
            </div>
          )}
          {selectedUid && fullMessage && (
            <div className="max-w-3xl mx-auto p-6 space-y-4">
              {/* Action bar */}
              <div className="flex items-center gap-2 pb-3 border-b border-border">
                <Button variant="outline" size="sm" onClick={handleReply} className="gap-1">
                  <Reply className="h-3.5 w-3.5" /> Antworten
                </Button>
                <Button variant="outline" size="sm" onClick={handleForward} className="gap-1">
                  <Forward className="h-3.5 w-3.5" /> Weiterleiten
                </Button>
                <Button variant="outline" size="sm" className="gap-1 ml-auto" disabled>
                  <Trash2 className="h-3.5 w-3.5" /> Löschen
                </Button>
              </div>

              {/* Cross-link */}
              {linkedDealQuery.data && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-primary/5 border border-primary/20 text-sm">
                  <ExternalLink className="h-4 w-4 text-primary shrink-0" />
                  <span className="text-muted-foreground">Verknüpfter Kunde:</span>
                  <span className="font-medium">
                    {linkedDealQuery.data.client_name || linkedDealQuery.data.vor_nachname}
                  </span>
                  <Button
                    variant="link"
                    size="sm"
                    className="ml-auto h-auto p-0"
                    onClick={() => navigate(`/kunden/${linkedDealQuery.data!.id}`)}
                  >
                    Profil öffnen →
                  </Button>
                </div>
              )}

              {/* Subject + sender */}
              <h1 className="text-xl font-semibold leading-tight">
                {fullMessage.subject || '(kein Betreff)'}
              </h1>
              <div className="flex items-start gap-3">
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-semibold shrink-0"
                  style={{ background: emailColorFromAddress(fullMessage.from_address ?? '') }}
                >
                  {senderInitials(fullMessage.from_name, fullMessage.from_address ?? '')}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">
                    {fullMessage.from_name ?? fullMessage.from_address}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    {fullMessage.from_address}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    An: {(fullMessage.to_addresses ?? []).join(', ')}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {fullMessage.date && new Date(fullMessage.date).toLocaleString('de-DE')}
                  </div>
                </div>
              </div>

              {/* Image-blocking banner */}
              {hasExternalImages && !showImages && (
                <div className="flex items-center gap-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs">
                  <span className="flex-1">🚫 Externe Bilder wurden blockiert zum Schutz deiner Privatsphäre.</span>
                  <Button size="sm" variant="outline" onClick={() => setShowImages(true)}>
                    Bilder anzeigen
                  </Button>
                </div>
              )}

              {/* Body */}
              {hasHtml ? (
                <div
                  ref={bodyRef}
                  className="prose prose-sm dark:prose-invert max-w-none email-body"
                  dangerouslySetInnerHTML={{ __html: finalHtml }}
                />
              ) : fullMessage.body_text && fullMessage.body_text.trim().length > 0 ? (
                <div
                  ref={bodyRef}
                  className="text-sm whitespace-pre-wrap font-sans leading-relaxed text-foreground/90 break-words"
                  dangerouslySetInnerHTML={{ __html: linkedText }}
                />
              ) : (
                <div className="text-sm text-muted-foreground italic py-6 text-center">
                  Diese Nachricht enthält keinen darstellbaren Inhalt.
                  {fullMessage.attachments && fullMessage.attachments.length > 0 && ' Siehe Anhänge unten.'}
                </div>
              )}

              {/* Attachments */}
              {fullMessage.attachments && fullMessage.attachments.length > 0 && (
                <div className="pt-4 border-t border-border space-y-2">
                  <div className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
                    <Paperclip className="h-3.5 w-3.5" /> Anhänge ({fullMessage.attachments.length})
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {fullMessage.attachments.map((a) => (
                      <button
                        key={a.attachmentId}
                        onClick={() => downloadAttachment(a.attachmentId, a.filename)}
                        className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border hover:bg-muted/60 transition-colors text-xs"
                      >
                        <Paperclip className="h-3.5 w-3.5" />
                        <span className="font-medium">{a.filename}</span>
                        <span className="text-muted-foreground">· {formatBytes(a.size)}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Debug inspector */}
              <details
                className="pt-4 border-t border-border text-xs text-muted-foreground"
                open={showRaw}
                onToggle={(e) => setShowRaw((e.target as HTMLDetailsElement).open)}
              >
                <summary className="cursor-pointer select-none hover:text-foreground transition-colors">
                  🔧 Debug
                </summary>
                <div className="mt-2 space-y-1 font-mono">
                  <div>UID: {fullMessage.uid}</div>
                  <div>Body Text: {fullMessage.body_text?.length ?? 0} chars</div>
                  <div>Body HTML: {fullMessage.body_html?.length ?? 0} chars</div>
                  <div>Attachments: {fullMessage.attachments?.length ?? 0}</div>
                  <div>Fetched: {fullMessage.body_fetched_at ?? '—'}</div>
                  <div>Rendered as: {hasHtml ? 'HTML' : fullMessage.body_text ? 'Text (auto-linked)' : 'Empty'}</div>
                </div>
              </details>
            </div>
          )}
        </div>
      </div>

      <AddAccountModal
        open={addOpen}
        onClose={() => { setAddOpen(false); setAddPrefill(null); }}
        onAccountSaved={() => { accountsQuery.refetch(); setAddPrefill(null); }}
        prefill={addPrefill}
      />
      <AccountsModal
        open={accountsOpen}
        onClose={() => setAccountsOpen(false)}
        accounts={accounts as any}
        onAddNew={() => { setAccountsOpen(false); setAddPrefill(null); setAddOpen(true); }}
        onRepair={(acc) => { setAccountsOpen(false); setAddPrefill(acc as any); setAddOpen(true); }}
        onChanged={() => accountsQuery.refetch()}
      />
      <ComposeModal
        open={composeOpen}
        onClose={() => setComposeOpen(false)}
        accounts={accounts.map((a) => ({ id: a.id, email_address: a.email_address, display_name: a.display_name, is_default: a.is_default }))}
        defaultAccountId={activeAccountId ?? undefined}
        prefill={composePrefill}
        onSent={handleRefresh}
      />
      <EmailSummaryPanel
        open={summaryOpen}
        onClose={() => setSummaryOpen(false)}
        messages={messages}
        onSelectEmail={(uid) => setSelectedUid(uid)}
      />
    </div>
  );
}

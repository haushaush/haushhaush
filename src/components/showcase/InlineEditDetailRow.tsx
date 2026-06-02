import * as React from "react";
import { Check, ChevronDown, Loader2, Pencil, X, Unlink } from "lucide-react";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator,
} from "@/components/ui/command";

export interface InlineOption {
  value: string;
  label: string;
  sublabel?: string;
}

interface Props {
  label: string;
  /** Current stored value (id or text). Use null/empty when not set. */
  value: string | null;
  /** What's displayed when not editing. */
  displayValue: string;
  options: InlineOption[];
  placeholder?: string;
  /** Allow free-text save (Branche). */
  allowFreeText?: boolean;
  /** Show "Trennen" option that saves null. */
  allowClear?: boolean;
  /** Called on selection. Should resolve once persisted. */
  onSave: (newValue: string | null) => Promise<void>;
  disabled?: boolean;
  /** "Empty" placeholder shown when displayValue is empty */
  emptyLabel?: string;
}

type Status = "idle" | "saving" | "success" | "error";

const normalize = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

export function InlineEditDetailRow({
  label, value, displayValue, options, placeholder = "Suchen…",
  allowFreeText, allowClear, onSave, disabled, emptyLabel = "— nicht gesetzt —",
}: Props) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const [status, setStatus] = React.useState<Status>("idle");

  React.useEffect(() => {
    if (status !== "success") return;
    const t = setTimeout(() => setStatus("idle"), 1500);
    return () => clearTimeout(t);
  }, [status]);

  const handlePick = async (newValue: string | null) => {
    setOpen(false);
    setSearch("");
    setStatus("saving");
    try {
      await onSave(newValue);
      setStatus("success");
    } catch {
      setStatus("error");
      setTimeout(() => setStatus("idle"), 2000);
    }
  };

  const filtered = React.useMemo(() => {
    const q = normalize(search);
    if (!q) return options;
    return options.filter(o => normalize(o.label).includes(q) || normalize(o.sublabel ?? "").includes(q));
  }, [options, search]);

  const showCreate =
    allowFreeText && search.trim().length >= 1 &&
    !options.some(o => normalize(o.label) === normalize(search));

  if (disabled) {
    return (
      <div className="flex justify-between items-center gap-4 py-1.5">
        <dt className="text-base text-gray-500 dark:text-gray-400 font-medium shrink-0">{label}</dt>
        <dd className="text-base text-right font-semibold text-gray-900 dark:text-white truncate min-w-0 max-w-[60%]">
          {displayValue || <span className="text-gray-400 italic">{emptyLabel}</span>}
        </dd>
      </div>
    );
  }

  return (
    <div className="flex justify-between items-center gap-4 py-1.5">
      <dt className="text-base text-gray-500 dark:text-gray-400 font-medium shrink-0">{label}</dt>
      <dd className="flex justify-end min-w-0 max-w-[60%]">
        <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setSearch(""); }}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className={cn(
                "group flex items-center gap-1.5 max-w-full justify-end rounded-md px-2 py-1 -mr-2 text-base font-semibold transition-colors",
                "text-gray-900 dark:text-white hover:bg-muted/30",
                "border border-transparent cursor-pointer",
                open && "border-primary/50 bg-muted/40",
                status === "error" && "border-red-400/60 bg-red-50/40 dark:bg-red-950/20",
              )}
            >
              <span className="truncate">
                {displayValue || <span className="text-gray-400 italic font-normal">{emptyLabel}</span>}
              </span>
              {status === "saving" ? (
                <Loader2 className="w-3.5 h-3.5 shrink-0 animate-spin text-muted-foreground" />
              ) : status === "success" ? (
                <Check className="w-3.5 h-3.5 shrink-0 text-emerald-500 animate-in fade-in zoom-in" />
              ) : status === "error" ? (
                <X className="w-3.5 h-3.5 shrink-0 text-red-500" />
              ) : (
                <Pencil className="w-3 h-3 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-60 transition-opacity" />
              )}
              <ChevronDown className={cn(
                "w-3 h-3 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-60 transition-all",
                open && "opacity-100 rotate-180"
              )} />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-[280px] p-0" align="end">
            <Command shouldFilter={false}>
              <CommandInput
                placeholder={placeholder}
                value={search}
                onValueChange={setSearch}
                onKeyDown={(e) => { if (e.key === "Escape") { setOpen(false); setSearch(""); } }}
              />
              <CommandList>
                <CommandEmpty>{allowFreeText ? "Tippen zum Anlegen…" : "Keine Treffer"}</CommandEmpty>
                {filtered.length > 0 && (
                  <CommandGroup>
                    {filtered.slice(0, 100).map((o) => (
                      <CommandItem key={o.value} value={o.value} onSelect={() => handlePick(o.value)}>
                        <Check className={cn("w-3.5 h-3.5 mr-2", value === o.value ? "opacity-100" : "opacity-0")} />
                        <div className="flex flex-col min-w-0">
                          <span className="truncate">{o.label}</span>
                          {o.sublabel && <span className="text-xs text-muted-foreground truncate">{o.sublabel}</span>}
                        </div>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}
                {showCreate && (
                  <CommandGroup heading="Neu">
                    <CommandItem value={`__create__${search}`} onSelect={() => handlePick(search.trim())}>
                      <span className="text-muted-foreground mr-2">+</span>
                      <span>Neu: <span className="font-medium">"{search.trim()}"</span></span>
                    </CommandItem>
                  </CommandGroup>
                )}
                {allowClear && value && (
                  <>
                    <CommandSeparator />
                    <CommandGroup>
                      <CommandItem value="__clear__" onSelect={() => handlePick(null)} className="text-muted-foreground">
                        <Unlink className="w-3.5 h-3.5 mr-2" />
                        Trennen
                      </CommandItem>
                    </CommandGroup>
                  </>
                )}
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </dd>
    </div>
  );
}

import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  data: any;
}

export function MetaDetailPanel({ open, onOpenChange, title, data }: Props) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-xl overflow-hidden flex flex-col">
        <SheetHeader>
          <SheetTitle className="text-xl pr-8">{title}</SheetTitle>
        </SheetHeader>
        <ScrollArea className="flex-1 mt-4 pr-4 -mr-4">
          {data?.creative?.thumbnail_url && (
            <img
              src={data.creative.thumbnail_url}
              alt=""
              className="w-full max-h-64 object-contain rounded-md border border-border bg-muted/30 mb-4"
            />
          )}
          <div className="space-y-3">
            {Object.entries(data || {}).map(([key, value]) => (
              <div key={key} className="grid grid-cols-[140px_1fr] gap-3 text-sm border-b border-border/50 pb-2">
                <span className="text-muted-foreground font-medium">{key}</span>
                <span className="text-foreground break-all">
                  {typeof value === 'object' ? (
                    <pre className="text-xs bg-muted/40 p-2 rounded overflow-x-auto">
                      {JSON.stringify(value, null, 2)}
                    </pre>
                  ) : (
                    String(value ?? '–')
                  )}
                </span>
              </div>
            ))}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}

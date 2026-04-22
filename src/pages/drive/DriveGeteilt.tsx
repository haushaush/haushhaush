import { DriveEmptyState } from '@/components/drive/DriveEmptyState';

export default function DriveGeteilt() {
  return (
    <div className="px-6 py-8 max-w-7xl mx-auto space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Geteilt mit mir</h1>
        <p className="text-sm text-muted-foreground">
          Dateien und Ordner, die andere mit dir geteilt haben.
        </p>
      </header>
      <DriveEmptyState />
    </div>
  );
}

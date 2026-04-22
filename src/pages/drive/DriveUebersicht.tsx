import { DriveEmptyState } from '@/components/drive/DriveEmptyState';

export default function DriveUebersicht() {
  return (
    <div className="px-6 py-8 max-w-7xl mx-auto space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Drive — Übersicht</h1>
        <p className="text-sm text-muted-foreground">
          Zentrale Ansicht aller verbundenen Drive-Inhalte.
        </p>
      </header>
      <DriveEmptyState />
    </div>
  );
}

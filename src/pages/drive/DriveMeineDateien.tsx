import { DriveEmptyState } from '@/components/drive/DriveEmptyState';

export default function DriveMeineDateien() {
  return (
    <div className="px-6 py-8 max-w-7xl mx-auto space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Meine Dateien</h1>
        <p className="text-sm text-muted-foreground">
          Alle Dateien aus deinem persönlichen Drive.
        </p>
      </header>
      <DriveEmptyState />
    </div>
  );
}

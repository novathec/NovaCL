import { Card, CardContent } from "@/components/ui/card";
import { Skeleton, TableRowsSkeleton } from "@/components/ui/skeleton";
import { LabLoader } from "@/components/ui/lab-loader";

export default function ResultadosLoading() {
  return (
    <>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          <Skeleton className="h-7 w-56" />
          <Skeleton className="h-4 w-64" />
        </div>
      </div>
      <div className="mb-4">
        <Skeleton className="h-9 w-full max-w-sm" />
      </div>
      <Card>
        <CardContent className="p-6">
          <LabLoader label="Procesando resultados…" />
          <TableRowsSkeleton rows={5} />
        </CardContent>
      </Card>
    </>
  );
}

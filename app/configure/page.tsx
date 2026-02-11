import { ConfigForm } from "@/components/pipeline/config-form";

export default function ConfigurePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          New Discovery Run
        </h1>
        <p className="mt-1 text-muted-foreground">
          Configure your business context and Unity Catalog scope, then let
          Inspire AI discover use cases.
        </p>
      </div>
      <ConfigForm />
    </div>
  );
}

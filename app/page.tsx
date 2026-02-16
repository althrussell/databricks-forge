import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function DashboardPage() {
  return (
    <div className="space-y-8">
      <div className="flex items-center gap-3">
        <Image
          src="/databricks-icon.svg"
          alt="Databricks"
          width={36}
          height={38}
          className="shrink-0"
        />
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Databricks Inspire AI
          </h1>
          <p className="mt-1 text-muted-foreground">
            Transform your Unity Catalog metadata into actionable, AI-generated
            use cases.
          </p>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Configure</CardTitle>
            <CardDescription>
              Set your business context, select catalogs, and choose priorities
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="mb-4 text-sm text-muted-foreground">
              Point Inspire at your Unity Catalog metadata and let AI discover
              high-value use cases for your data.
            </p>
            <Button asChild>
              <Link href="/configure">Start New Discovery</Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Run Pipeline</CardTitle>
            <CardDescription>
              AI analyses your metadata in 7 steps
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ol className="mb-4 space-y-1 text-sm text-muted-foreground">
              <li>1. Generate business context</li>
              <li>2. Extract metadata</li>
              <li>3. Filter business tables</li>
              <li>4. Generate use cases</li>
              <li>5. Cluster into domains</li>
              <li>6. Score and deduplicate</li>
              <li>7. Generate SQL per use case</li>
            </ol>
            <Button variant="outline" asChild>
              <Link href="/runs">View Runs</Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Export Results</CardTitle>
            <CardDescription>
              Download in multiple formats
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="mb-4 space-y-1 text-sm text-muted-foreground">
              <li>Excel -- prioritised use case catalog</li>
              <li>PDF -- professional documentation</li>
              <li>PowerPoint -- executive slides</li>
              <li>Notebooks -- SQL code in Databricks</li>
            </ul>
            <Button variant="outline" asChild>
              <Link href="/runs">Browse Results</Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card className="border-dashed">
        <CardHeader>
          <CardTitle className="text-lg">Privacy &amp; Data Access</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-sm text-muted-foreground">
            By default, Inspire reads <strong>metadata only</strong> -- schema
            names, table names, and column names. No row-level data is accessed.
          </p>
          <p className="text-sm text-muted-foreground">
            If you enable <strong>Data Sampling</strong> in the advanced
            configuration, Inspire will read a small number of sample rows per
            table (configurable: 5-50) to help the LLM generate more accurate
            SQL. Sampled data is sent to the configured AI model endpoint and is
            not stored.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

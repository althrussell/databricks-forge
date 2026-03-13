"use client";

import { useState, useCallback, useEffect } from "react";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { DemoScope } from "@/lib/demo/types";
import { buildSchemaName } from "@/lib/demo/scope";

interface CatalogSelectionStepProps {
  catalog: string;
  onCatalogChange: (v: string) => void;
  schema: string;
  onSchemaChange: (v: string) => void;
  customerName: string;
  scope?: DemoScope;
  onCatalogCreatedChange: (v: boolean) => void;
}

type ValidationState = "idle" | "validating" | "valid" | "error";

export function CatalogSelectionStep({
  catalog,
  onCatalogChange,
  schema,
  onSchemaChange,
  customerName,
  scope,
  onCatalogCreatedChange,
}: CatalogSelectionStepProps) {
  const [validation, setValidation] = useState<ValidationState>("idle");
  const [validationError, setValidationError] = useState("");
  const [validationDetails, setValidationDetails] = useState<{
    catalogExists: boolean;
    schemaExists: boolean;
  } | null>(null);

  // Auto-suggest schema name
  useEffect(() => {
    if (!schema && customerName) {
      onSchemaChange(buildSchemaName(customerName, scope));
    }
  }, [customerName, scope, schema, onSchemaChange]);

  const handleValidate = useCallback(async () => {
    if (!catalog || !schema) return;

    setValidation("validating");
    setValidationError("");

    try {
      const resp = await fetch("/api/demo/validate-catalog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          catalog,
          schema,
          createCatalog: true,
        }),
      });

      const data = await resp.json();

      if (data.error) {
        setValidation("error");
        setValidationError(data.error);
      } else if (data.canCreateSchema) {
        setValidation("valid");
        setValidationDetails({
          catalogExists: data.catalogExists,
          schemaExists: data.schemaExists,
        });
        onCatalogCreatedChange(!data.catalogExists);
      } else {
        setValidation("error");
        setValidationError("Cannot create schema in this catalog.");
      }
    } catch (err) {
      setValidation("error");
      setValidationError("Validation failed. Check your connection.");
    }
  }, [catalog, schema, onCatalogCreatedChange]);

  return (
    <div className="space-y-6 px-1">
      <div className="space-y-2">
        <Label htmlFor="catalog-name">Catalog Name</Label>
        <Input
          id="catalog-name"
          placeholder="e.g. demo_catalog or an existing catalog"
          value={catalog}
          onChange={(e) => {
            onCatalogChange(e.target.value);
            setValidation("idle");
          }}
        />
        <p className="text-xs text-muted-foreground">
          Enter an existing catalog or a new name. We&apos;ll create it if needed.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="schema-name">Schema Name</Label>
        <Input
          id="schema-name"
          placeholder="Auto-generated from customer name"
          value={schema}
          onChange={(e) => {
            onSchemaChange(e.target.value);
            setValidation("idle");
          }}
        />
      </div>

      <Button
        variant="outline"
        onClick={handleValidate}
        disabled={!catalog || !schema || validation === "validating"}
      >
        {validation === "validating" && (
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
        )}
        Validate Permissions
      </Button>

      {validation === "valid" && validationDetails && (
        <div className="rounded-md bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 p-3 space-y-1">
          <div className="flex items-center gap-2 text-green-700 dark:text-green-300">
            <CheckCircle2 className="h-4 w-4" />
            <span className="text-sm font-medium">Permissions validated</span>
          </div>
          <div className="flex gap-2">
            <Badge variant={validationDetails.catalogExists ? "secondary" : "brand"}>
              {validationDetails.catalogExists ? "Catalog exists" : "Will create catalog"}
            </Badge>
            <Badge variant={validationDetails.schemaExists ? "secondary" : "brand"}>
              {validationDetails.schemaExists ? "Schema exists" : "Will create schema"}
            </Badge>
          </div>
        </div>
      )}

      {validation === "error" && validationError && (
        <div className="rounded-md bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 p-3">
          <div className="flex items-center gap-2 text-red-700 dark:text-red-300">
            <AlertCircle className="h-4 w-4" />
            <span className="text-sm">{validationError}</span>
          </div>
        </div>
      )}

      <div className="rounded-md bg-muted p-3">
        <p className="text-xs text-muted-foreground">
          Demo data will be created at: <code className="text-foreground">{catalog || "..."}.{schema || "..."}</code>
        </p>
      </div>
    </div>
  );
}

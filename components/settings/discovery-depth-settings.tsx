"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Target, Scale, Layers } from "lucide-react";
import { InfoTip } from "@/components/ui/info-tip";
import { SETTINGS } from "@/lib/help-text";
import {
  DEFAULT_DEPTH_CONFIGS,
  type DiscoveryDepth,
  type DiscoveryDepthConfig,
} from "@/lib/domain/types";

interface DiscoveryDepthSettingsProps {
  defaultDiscoveryDepth: DiscoveryDepth;
  onDefaultDiscoveryDepthChange: (value: DiscoveryDepth) => void;
  depthConfigs: Record<DiscoveryDepth, DiscoveryDepthConfig>;
  onDepthConfigsChange: (value: Record<DiscoveryDepth, DiscoveryDepthConfig>) => void;
  updateDepthParam: (depth: DiscoveryDepth, key: keyof DiscoveryDepthConfig, value: number) => void;
}

const DEPTH_OPTIONS: { value: DiscoveryDepth; label: string; icon: typeof Target; description: string }[] = [
  { value: "focused", label: "Focused", icon: Target, description: "Fewer, highest-quality use cases" },
  { value: "balanced", label: "Balanced", icon: Scale, description: "Good mix of breadth and quality" },
  { value: "comprehensive", label: "Comprehensive", icon: Layers, description: "Maximum coverage across domains" },
];

export function DiscoveryDepthSettings({
  defaultDiscoveryDepth,
  onDefaultDiscoveryDepthChange,
  depthConfigs,
  onDepthConfigsChange,
  updateDepthParam,
}: DiscoveryDepthSettingsProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Target className="h-5 w-5" />
          Discovery Depth
        </CardTitle>
        <CardDescription>
          Configure the parameters for each discovery depth level and choose
          the default. Each level controls how many use cases are generated per
          batch, the minimum quality threshold, and the maximum output volume.
          You can still override the depth level per-run.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <Label>Default depth for new runs</Label>
          <div className="flex gap-2">
            {(["focused", "balanced", "comprehensive"] as DiscoveryDepth[]).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => onDefaultDiscoveryDepthChange(d)}
                className={`rounded-md border-2 px-4 py-2 text-sm font-medium transition-colors ${
                  defaultDiscoveryDepth === d
                    ? "border-primary bg-primary/5 text-primary"
                    : "border-muted text-muted-foreground hover:border-muted-foreground/30"
                }`}
              >
                {d.charAt(0).toUpperCase() + d.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <Separator />

        <div className="grid gap-4 lg:grid-cols-3">
          {DEPTH_OPTIONS.map((opt) => {
            const cfg = depthConfigs[opt.value];
            const defaults = DEFAULT_DEPTH_CONFIGS[opt.value];
            const Icon = opt.icon;
            const isDefault = defaultDiscoveryDepth === opt.value;
            return (
              <div
                key={opt.value}
                className={`rounded-lg border-2 p-4 space-y-4 ${
                  isDefault ? "border-primary/50 bg-primary/5" : "border-muted"
                }`}
              >
                <div className="flex items-center gap-2">
                  <Icon className={`h-4 w-4 ${isDefault ? "text-primary" : "text-muted-foreground"}`} />
                  <span className="text-sm font-semibold">{opt.label}</span>
                  {isDefault && (
                    <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                      Default
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">{opt.description}</p>

                <div className="space-y-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5">
                      <Label className="text-xs">Batch target (min-max use cases per batch)</Label>
                      <InfoTip tip={SETTINGS.batchTarget} />
                    </div>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min={1}
                        max={50}
                        value={cfg.batchTargetMin}
                        onChange={(e) => updateDepthParam(opt.value, "batchTargetMin", parseInt(e.target.value) || defaults.batchTargetMin)}
                        className="w-20 h-8 text-sm"
                      />
                      <span className="text-xs text-muted-foreground">to</span>
                      <Input
                        type="number"
                        min={1}
                        max={100}
                        value={cfg.batchTargetMax}
                        onChange={(e) => updateDepthParam(opt.value, "batchTargetMax", parseInt(e.target.value) || defaults.batchTargetMax)}
                        className="w-20 h-8 text-sm"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5">
                      <Label className="text-xs">Quality floor (0-1, minimum overall score)</Label>
                      <InfoTip tip={SETTINGS.qualityFloor} />
                    </div>
                    <Input
                      type="number"
                      min={0}
                      max={1}
                      step={0.05}
                      value={cfg.qualityFloor}
                      onChange={(e) => updateDepthParam(opt.value, "qualityFloor", parseFloat(e.target.value) || defaults.qualityFloor)}
                      className="w-24 h-8 text-sm"
                    />
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5">
                      <Label className="text-xs">Adaptive cap (max use cases in output)</Label>
                      <InfoTip tip={SETTINGS.adaptiveCap} />
                    </div>
                    <Input
                      type="number"
                      min={10}
                      max={1000}
                      step={5}
                      value={cfg.adaptiveCap}
                      onChange={(e) => updateDepthParam(opt.value, "adaptiveCap", parseInt(e.target.value) || defaults.adaptiveCap)}
                      className="w-24 h-8 text-sm"
                    />
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5">
                      <Label className="text-xs">Lineage depth (max hops to walk)</Label>
                      <InfoTip tip={SETTINGS.lineageDepth} />
                    </div>
                    <Input
                      type="number"
                      min={1}
                      max={10}
                      value={cfg.lineageDepth}
                      onChange={(e) => updateDepthParam(opt.value, "lineageDepth", parseInt(e.target.value) || defaults.lineageDepth)}
                      className="w-24 h-8 text-sm"
                    />
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => onDepthConfigsChange({ ...depthConfigs, [opt.value]: { ...defaults } })}
                  className="text-[11px] text-muted-foreground hover:text-foreground transition-colors underline underline-offset-2"
                >
                  Reset to defaults
                </button>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

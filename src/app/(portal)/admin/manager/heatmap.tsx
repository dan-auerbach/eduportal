"use client";

import { cn } from "@/lib/utils";
import type { HeatmapCell } from "@/actions/manager-dashboard";

type CompletionHeatmapProps = {
  cells: HeatmapCell[];
};

function getHeatColor(percent: number): string {
  if (percent >= 80) return "bg-green-500/80 text-white";
  if (percent >= 60) return "bg-green-400/60 text-green-950 dark:text-white";
  if (percent >= 40) return "bg-yellow-400/60 text-yellow-950 dark:text-white";
  if (percent >= 20) return "bg-orange-400/60 text-orange-950 dark:text-white";
  return "bg-red-400/50 text-red-950 dark:text-white";
}

export function CompletionHeatmap({ cells }: CompletionHeatmapProps) {
  // Build matrix: groups (rows) × modules (columns)
  const groupMap = new Map<string, { id: string; name: string }>();
  const moduleMap = new Map<string, { id: string; title: string }>();

  for (const c of cells) {
    if (!groupMap.has(c.groupId)) {
      groupMap.set(c.groupId, { id: c.groupId, name: c.groupName });
    }
    if (!moduleMap.has(c.moduleId)) {
      moduleMap.set(c.moduleId, { id: c.moduleId, title: c.moduleTitle });
    }
  }

  const groups = Array.from(groupMap.values());
  const modules = Array.from(moduleMap.values());

  // Build lookup
  const cellMap = new Map(
    cells.map((c) => [`${c.groupId}:${c.moduleId}`, c]),
  );

  if (groups.length === 0 || modules.length === 0) {
    return <p className="text-sm text-muted-foreground">Ni podatkov za prikaz.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr>
            <th className="sticky left-0 bg-background px-2 py-1.5 text-left font-medium text-muted-foreground">
              Skupina / Modul
            </th>
            {modules.map((m) => (
              <th
                key={m.id}
                className="px-2 py-1.5 text-center font-medium text-muted-foreground max-w-[120px] truncate"
                title={m.title}
              >
                {m.title.length > 15 ? `${m.title.slice(0, 15)}...` : m.title}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => (
            <tr key={g.id}>
              <td className="sticky left-0 bg-background px-2 py-1 font-medium text-sm whitespace-nowrap">
                {g.name}
              </td>
              {modules.map((m) => {
                const cell = cellMap.get(`${g.id}:${m.id}`);
                const pct = cell?.completionPercent ?? 0;

                return (
                  <td key={m.id} className="px-1 py-1">
                    <div
                      className={cn(
                        "flex h-8 items-center justify-center rounded text-xs font-semibold tabular-nums",
                        cell ? getHeatColor(pct) : "bg-muted text-muted-foreground",
                      )}
                      title={
                        cell
                          ? `${cell.completedUsers}/${cell.totalUsers} (${pct}%)`
                          : "N/A"
                      }
                    >
                      {cell ? `${pct}%` : "-"}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

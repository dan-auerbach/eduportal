export function validateSectionUnlockChain(
  sections: { id: string; unlockAfterSectionId: string | null }[]
): { valid: boolean; error?: string } {
  // 1. At least one section must have unlockAfterSectionId = null (entry point)
  const entryPoints = sections.filter((s) => s.unlockAfterSectionId === null);
  if (entryPoints.length === 0) {
    return { valid: false, error: "Vsaj ena sekcija mora biti brez pogoja (vstopna točka)." };
  }

  // 2. DFS for cycle detection
  const graph = new Map<string, string[]>();
  for (const s of sections) {
    if (s.unlockAfterSectionId) {
      const deps = graph.get(s.unlockAfterSectionId) || [];
      deps.push(s.id);
      graph.set(s.unlockAfterSectionId, deps);
    }
  }

  const visited = new Set<string>();
  const inStack = new Set<string>();

  function hasCycle(nodeId: string): boolean {
    visited.add(nodeId);
    inStack.add(nodeId);
    for (const neighbor of graph.get(nodeId) || []) {
      if (!visited.has(neighbor)) {
        if (hasCycle(neighbor)) return true;
      } else if (inStack.has(neighbor)) {
        return true;
      }
    }
    inStack.delete(nodeId);
    return false;
  }

  for (const section of sections) {
    if (!visited.has(section.id) && hasCycle(section.id)) {
      return { valid: false, error: "Zaznana ciklična odvisnost med sekcijami." };
    }
  }

  // 3. Check that unlockAfterSectionId references existing section within same module
  const sectionIds = new Set(sections.map((s) => s.id));
  for (const s of sections) {
    if (s.unlockAfterSectionId && !sectionIds.has(s.unlockAfterSectionId)) {
      return { valid: false, error: `Sekcija "${s.id}" referencira neobstoječo sekcijo.` };
    }
  }

  return { valid: true };
}

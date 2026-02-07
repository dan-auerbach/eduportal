/**
 * Module sorting utilities for employee portal.
 * Shared between /modules page and /dashboard.
 */

export type SortableModule = {
  id: string;
  title: string;
  isMandatory: boolean;
  deadline: Date | null;
  categoryName?: string | null;
  progress: {
    status: string;
    percentage: number;
  };
};

const STATUS_ORDER: Record<string, number> = {
  IN_PROGRESS: 0,
  READY_FOR_QUIZ: 1,
  NOT_STARTED: 2,
  COMPLETED: 3,
};

/**
 * Default "Recommended" sort:
 * 1. Company-pinned first
 * 2. User-pinned next
 * 3. Mandatory before non-mandatory
 * 4. Nearest deadline first (null deadlines last)
 * 5. IN_PROGRESS → READY_FOR_QUIZ → NOT_STARTED → COMPLETED
 * 6. Title A→Z
 */
function sortRecommended<T extends SortableModule>(
  modules: T[],
  companyPinSet: Set<string>,
  userPinSet: Set<string>
): T[] {
  return [...modules].sort((a, b) => {
    // 1. Company pinned first
    const aCp = companyPinSet.has(a.id) ? 0 : 1;
    const bCp = companyPinSet.has(b.id) ? 0 : 1;
    if (aCp !== bCp) return aCp - bCp;

    // 2. User pinned next
    const aUp = userPinSet.has(a.id) ? 0 : 1;
    const bUp = userPinSet.has(b.id) ? 0 : 1;
    if (aUp !== bUp) return aUp - bUp;

    // 3. Mandatory before non-mandatory
    if (a.isMandatory !== b.isMandatory) return a.isMandatory ? -1 : 1;

    // 4. Nearest deadline first
    if (a.deadline && b.deadline) {
      const diff = new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
      if (diff !== 0) return diff;
    } else if (a.deadline && !b.deadline) return -1;
    else if (!a.deadline && b.deadline) return 1;

    // 5. Status order
    const statusDiff = (STATUS_ORDER[a.progress.status] ?? 3) - (STATUS_ORDER[b.progress.status] ?? 3);
    if (statusDiff !== 0) return statusDiff;

    // 6. Title A-Z
    return a.title.localeCompare(b.title);
  });
}

/**
 * Sort modules by the chosen sort option.
 */
export function sortModules<T extends SortableModule>(
  modules: T[],
  sortBy: string,
  companyPinSet: Set<string>,
  userPinSet: Set<string>
): T[] {
  switch (sortBy) {
    case "deadline":
      return [...modules].sort((a, b) => {
        if (a.deadline && b.deadline)
          return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
        if (a.deadline) return -1;
        if (b.deadline) return 1;
        return a.title.localeCompare(b.title);
      });

    case "progress":
      return [...modules].sort((a, b) => {
        const diff = b.progress.percentage - a.progress.percentage;
        return diff !== 0 ? diff : a.title.localeCompare(b.title);
      });

    case "title":
      return [...modules].sort((a, b) => a.title.localeCompare(b.title));

    case "category":
      return [...modules].sort((a, b) => {
        const catA = a.categoryName ?? "\uffff"; // uncategorized last
        const catB = b.categoryName ?? "\uffff";
        const catDiff = catA.localeCompare(catB);
        return catDiff !== 0 ? catDiff : a.title.localeCompare(b.title);
      });

    case "recommended":
    default:
      return sortRecommended(modules, companyPinSet, userPinSet);
  }
}

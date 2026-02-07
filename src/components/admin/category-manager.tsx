"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Pencil, Trash2, Plus, Check, X } from "lucide-react";
import { toast } from "sonner";

import { t } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  createCategory,
  updateCategory,
  deleteCategory,
  reorderCategories,
} from "@/actions/categories";

type CategoryItem = {
  id: string;
  name: string;
  sortOrder: number;
  _count: { modules: number };
};

interface CategoryManagerProps {
  categories: CategoryItem[];
  trigger: React.ReactNode;
}

export function CategoryManager({ categories: initialCategories, trigger }: CategoryManagerProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<CategoryItem[]>(initialCategories);
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    setItems(initialCategories);
  }, [initialCategories]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = items.findIndex((c) => c.id === active.id);
    const newIndex = items.findIndex((c) => c.id === over.id);
    const newItems = arrayMove(items, oldIndex, newIndex);
    setItems(newItems);

    const result = await reorderCategories(newItems.map((c) => c.id));
    if (result.success) {
      toast.success(t("admin.categories.categoriesReordered"));
      router.refresh();
    } else {
      toast.error(result.error);
      setItems(items); // revert
    }
  }

  async function handleAdd() {
    if (!newName.trim()) return;
    setAdding(true);
    const result = await createCategory({ name: newName.trim() });
    setAdding(false);
    if (result.success) {
      toast.success(t("admin.categories.categoryCreated"));
      setNewName("");
      router.refresh();
      // Optimistically add
      setItems((prev) => [
        ...prev,
        { id: result.data.id, name: newName.trim(), sortOrder: prev.length, _count: { modules: 0 } },
      ]);
    } else {
      toast.error(result.error);
    }
  }

  async function handleRename(id: string) {
    if (!editingName.trim()) return;
    const result = await updateCategory(id, { name: editingName.trim() });
    if (result.success) {
      toast.success(t("admin.categories.categoryUpdated"));
      setItems((prev) => prev.map((c) => (c.id === id ? { ...c, name: editingName.trim() } : c)));
      setEditingId(null);
      router.refresh();
    } else {
      toast.error(result.error);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm(t("admin.categories.confirmDelete"))) return;
    const result = await deleteCategory(id);
    if (result.success) {
      toast.success(t("admin.categories.categoryDeleted"));
      setItems((prev) => prev.filter((c) => c.id !== id));
      router.refresh();
    } else {
      toast.error(result.error);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("admin.categories.title")}</DialogTitle>
          <p className="text-sm text-muted-foreground">{t("admin.categories.subtitle")}</p>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {items.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              {t("admin.categories.noCategories")}
            </p>
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={items.map((c) => c.id)} strategy={verticalListSortingStrategy}>
                <div className="space-y-1">
                  {items.map((cat) => (
                    <SortableCategoryRow
                      key={cat.id}
                      category={cat}
                      isEditing={editingId === cat.id}
                      editingName={editingName}
                      onStartEdit={() => {
                        setEditingId(cat.id);
                        setEditingName(cat.name);
                      }}
                      onCancelEdit={() => setEditingId(null)}
                      onSaveEdit={() => handleRename(cat.id)}
                      onEditingNameChange={setEditingName}
                      onDelete={() => handleDelete(cat.id)}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}

          {/* Add new category */}
          <div className="flex items-center gap-2 pt-2 border-t">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={t("admin.categories.categoryNamePlaceholder")}
              className="flex-1"
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAdd();
              }}
            />
            <Button size="sm" onClick={handleAdd} disabled={adding || !newName.trim()}>
              <Plus className="h-4 w-4 mr-1" />
              {t("admin.categories.addCategory")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Sortable row ──

interface SortableCategoryRowProps {
  category: CategoryItem;
  isEditing: boolean;
  editingName: string;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: () => void;
  onEditingNameChange: (name: string) => void;
  onDelete: () => void;
}

function SortableCategoryRow({
  category,
  isEditing,
  editingName,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onEditingNameChange,
  onDelete,
}: SortableCategoryRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: category.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-2 rounded-md border bg-card px-3 py-2 ${isDragging ? "opacity-50" : ""}`}
    >
      <button
        type="button"
        className="cursor-grab text-muted-foreground hover:text-foreground shrink-0"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>

      {isEditing ? (
        <div className="flex items-center gap-1 flex-1 min-w-0">
          <Input
            value={editingName}
            onChange={(e) => onEditingNameChange(e.target.value)}
            className="h-7 text-sm"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") onSaveEdit();
              if (e.key === "Escape") onCancelEdit();
            }}
          />
          <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={onSaveEdit}>
            <Check className="h-3.5 w-3.5" />
          </Button>
          <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={onCancelEdit}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      ) : (
        <>
          <span className="text-sm font-medium flex-1 min-w-0 truncate">{category.name}</span>
          <span className="text-xs text-muted-foreground shrink-0">
            {category._count.modules}
          </span>
          <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={onStartEdit}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
            onClick={onDelete}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </>
      )}
    </div>
  );
}

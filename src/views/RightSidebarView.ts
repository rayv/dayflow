import { App, ItemView, WorkspaceLeaf, TFile } from "obsidian";
import { VIEW_TYPE_RIGHT_SIDEBAR, TodoItem } from "../types";
import { extractTodos } from "../utils/todoExtractor";
import { toDateStr } from "../utils/dateUtils";

type SortMode = "source-date" | "due-date" | "priority";
type SourceType = TodoItem["sourceType"];

const PRIORITY_LABELS: Record<string, string> = { high: "High", medium: "Med", low: "Low" };

const SOURCE_FILTER_CHIPS: { type: SourceType; label: string }[] = [
  { type: "daily", label: "Daily" },
  { type: "meeting", label: "Mtgs" },
  { type: "recurring", label: "Rec." },
];

export class RightSidebarView extends ItemView {
  private showCompleted = false;
  private todos: TodoItem[] = [];
  private collapsedSections: Set<string> = new Set();
  private sortMode: SortMode = "source-date";
  private sourceFilter: Set<SourceType> = new Set();
  private searchText = "";
  private listEl: HTMLElement | null = null;
  private onTodoClick: (filePath: string, line: number) => void;

  constructor(leaf: WorkspaceLeaf, onTodoClick: (filePath: string, line: number) => void) {
    super(leaf);
    this.onTodoClick = onTodoClick;
  }

  getViewType(): string { return VIEW_TYPE_RIGHT_SIDEBAR; }
  getDisplayText(): string { return "To-Do Items"; }
  getIcon(): string { return "check-square"; }

  async onOpen() {
    const container = this.containerEl.children[1] as HTMLElement;
    container.empty();
    container.addClass("rays-right-sidebar");

    this.renderControls(container);
    this.listEl = container.createDiv({ cls: "rays-todo-list-wrap" });

    await this.refresh();
  }

  async refresh() {
    this.todos = await extractTodos(this.app);
    this.renderList();
  }

  // ─── Controls (rendered once) ────────────────────────────────────────────

  private renderControls(container: HTMLElement) {
    // Header row: title + Done toggle
    const header = container.createDiv({ cls: "rays-todo-header" });
    header.createEl("h4", { text: "To Do Items" });

    const toggleLabel = header.createEl("label", { cls: "rays-todo-switch" });
    const doneCheckbox = toggleLabel.createEl("input", { type: "checkbox" });
    doneCheckbox.checked = this.showCompleted;
    doneCheckbox.addEventListener("change", () => {
      this.showCompleted = doneCheckbox.checked;
      this.renderList();
    });
    toggleLabel.createSpan({ cls: "rays-todo-slider" });
    toggleLabel.createSpan({ cls: "rays-todo-switch-label", text: "Done" });

    // Search input
    const searchInput = container.createEl("input", {
      cls: "rays-todo-search",
      type: "text",
      placeholder: "Search todos…",
    });
    searchInput.value = this.searchText;
    searchInput.addEventListener("input", () => {
      this.searchText = searchInput.value;
      this.renderList();
    });

    // Filter chips + sort row
    const controlsRow = container.createDiv({ cls: "rays-todo-controls-row" });

    const filtersWrap = controlsRow.createDiv({ cls: "rays-todo-filters" });
    for (const { type, label } of SOURCE_FILTER_CHIPS) {
      const chip = filtersWrap.createEl("button", {
        cls: `rays-todo-filter-chip${this.sourceFilter.has(type) ? " active" : ""}`,
        text: label,
      });
      chip.setAttribute("aria-pressed", String(this.sourceFilter.has(type)));
      chip.addEventListener("click", () => {
        if (this.sourceFilter.has(type)) {
          this.sourceFilter.delete(type);
          chip.removeClass("active");
        } else {
          this.sourceFilter.add(type);
          chip.addClass("active");
        }
        chip.setAttribute("aria-pressed", String(this.sourceFilter.has(type)));
        this.renderList();
      });
    }

    const sortSelect = controlsRow.createEl("select", { cls: "rays-todo-sort-select" });
    const sortOptions: { value: SortMode; label: string }[] = [
      { value: "source-date", label: "Source date" },
      { value: "due-date", label: "Due date" },
      { value: "priority", label: "Priority" },
    ];
    for (const { value, label } of sortOptions) {
      const opt = sortSelect.createEl("option", { value, text: label });
      if (value === this.sortMode) opt.selected = true;
    }
    sortSelect.addEventListener("change", () => {
      this.sortMode = sortSelect.value as SortMode;
      this.renderList();
    });
  }

  // ─── List (rebuilt on every filter/sort/refresh) ──────────────────────────

  private renderList() {
    const el = this.listEl;
    if (!el) return;
    el.empty();

    const todayStr = toDateStr(new Date());
    const visible = this.applyFilters();

    if (visible.length === 0) {
      const hasUnfiltered = this.todos.some((t) => this.showCompleted || !t.completed);
      const msg = hasUnfiltered
        ? "No matching todos"
        : this.showCompleted ? "No tasks found" : "All caught up!";
      this.renderEmptyState(el, msg);
      return;
    }

    for (const { key, items } of this.groupAndSort(visible)) {
      this.renderSection(el, key, items, todayStr);
    }
  }

  private applyFilters(): TodoItem[] {
    let items = this.showCompleted ? this.todos : this.todos.filter((t) => !t.completed);

    if (this.sourceFilter.size > 0) {
      items = items.filter((t) => this.sourceFilter.has(t.sourceType));
    }

    const q = this.searchText.trim().toLowerCase();
    if (q) {
      items = items.filter((t) => t.text.toLowerCase().includes(q));
    }

    return items;
  }

  // ─── Grouping & sorting ───────────────────────────────────────────────────

  private groupAndSort(items: TodoItem[]): { key: string; items: TodoItem[] }[] {
    const groups = new Map<string, TodoItem[]>();
    for (const todo of items) {
      const key = this.groupKey(todo);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(todo);
    }

    // Sort items within each group
    for (const groupItems of groups.values()) {
      if (this.sortMode === "due-date") {
        groupItems.sort((a, b) => {
          const da = a.dueDate ?? "9999-99-99";
          const db = b.dueDate ?? "9999-99-99";
          if (da !== db) return da.localeCompare(db);
          return this.priorityRank(a.priority) - this.priorityRank(b.priority);
        });
      } else {
        groupItems.sort((a, b) => {
          const pa = this.priorityRank(a.priority);
          const pb = this.priorityRank(b.priority);
          if (pa !== pb) return pa - pb;
          const da = a.dueDate ?? "9999-99-99";
          const db = b.dueDate ?? "9999-99-99";
          return da.localeCompare(db);
        });
      }
    }

    // Sort groups
    const keys = [...groups.keys()];

    if (this.sortMode === "due-date") {
      const minDue = (key: string) => {
        const dates = groups.get(key)!.map((t) => t.dueDate).filter((d): d is string => d !== null);
        return dates.length > 0 ? [...dates].sort()[0] : "9999-99-99";
      };
      keys.sort((a, b) => minDue(a).localeCompare(minDue(b)));
    } else if (this.sortMode === "priority") {
      const minRank = (key: string) =>
        Math.min(...groups.get(key)!.map((t) => this.priorityRank(t.priority)));
      keys.sort((a, b) => minRank(a) - minRank(b));
    } else {
      keys.sort((a, b) => this.sortKeyForGroup(b).localeCompare(this.sortKeyForGroup(a)));
    }

    return keys.map((key) => ({ key, items: groups.get(key)! }));
  }

  // ─── Rendering ────────────────────────────────────────────────────────────

  private renderEmptyState(container: HTMLElement, message: string) {
    const el = container.createDiv({ cls: "rays-todo-empty" });
    el.createDiv({ cls: "rays-todo-empty-icon", text: "\u2714" });
    el.createDiv({ cls: "rays-todo-empty-text", text: message });
  }

  private renderSection(container: HTMLElement, key: string, items: TodoItem[], todayStr: string) {
    const isCollapsed = this.collapsedSections.has(key);
    const section = container.createDiv({ cls: "rays-todo-section" });

    const sectionHeader = section.createEl("button", { cls: "rays-todo-section-header" });
    sectionHeader.setAttribute("aria-expanded", String(!isCollapsed));
    sectionHeader.setAttribute("aria-label", `${this.formatGroupLabel(key)}, ${items.length} items`);
    sectionHeader.createSpan({ cls: `rays-todo-arrow${isCollapsed ? " collapsed" : ""}` });
    sectionHeader.createSpan({ cls: "rays-todo-section-label", text: this.formatGroupLabel(key) });
    sectionHeader.createSpan({ cls: "rays-todo-section-count", text: String(items.length) });

    sectionHeader.addEventListener("click", () => {
      if (this.collapsedSections.has(key)) {
        this.collapsedSections.delete(key);
      } else {
        this.collapsedSections.add(key);
      }
      this.renderList();
    });

    if (isCollapsed) return;

    const list = section.createDiv({ cls: "rays-todo-list" });
    for (const todo of items) {
      this.renderTodoItem(list, todo, todayStr);
    }
  }

  private renderTodoItem(list: HTMLElement, todo: TodoItem, todayStr: string) {
    const priorityCls = todo.priority ? ` priority-${todo.priority}` : "";
    const completedCls = todo.completed ? " completed" : "";
    const item = list.createDiv({ cls: `rays-todo-item${completedCls}${priorityCls}` });

    const checkEl = item.createEl("button", { cls: `rays-todo-checkbox${todo.completed ? " checked" : ""}` });
    checkEl.setAttribute("aria-pressed", String(todo.completed));
    checkEl.setAttribute("aria-label", todo.completed ? "Mark incomplete" : "Mark complete");
    if (todo.completed) checkEl.createSpan({ cls: "rays-todo-checkmark" });

    checkEl.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      try {
        await this.toggleTodo(todo);
      } catch {
        await this.refresh();
      }
    });

    const content = item.createDiv({ cls: "rays-todo-content" });
    const topRow = content.createDiv({ cls: "rays-todo-top-row" });

    if (todo.priority) {
      topRow.createSpan({
        cls: `rays-todo-priority rays-todo-priority-${todo.priority}`,
        text: PRIORITY_LABELS[todo.priority],
      });
    }

    const textBtn = topRow.createEl("button", { cls: "rays-todo-text", text: todo.text });
    textBtn.setAttribute("aria-label", `Open ${todo.text}`);
    textBtn.addEventListener("click", (e) => {
      e.preventDefault();
      this.onTodoClick(todo.filePath, todo.lineNumber);
    });

    if (todo.dueDate) this.renderDueDateBadge(content, todo, todayStr);
  }

  private renderDueDateBadge(content: HTMLElement, todo: TodoItem, todayStr: string) {
    let dueCls = "rays-todo-due future";
    let dueLabel = todo.dueDate!;
    if (!todo.completed) {
      if (todo.dueDate! < todayStr) {
        dueCls = "rays-todo-due overdue";
        dueLabel = `Overdue \u00B7 ${todo.dueDate}`;
      } else if (todo.dueDate === todayStr) {
        dueCls = "rays-todo-due due-today";
        dueLabel = "Due today";
      }
    }
    content.createDiv({ cls: dueCls, text: dueLabel });
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

  private async toggleTodo(todo: TodoItem) {
    const file = this.app.vault.getAbstractFileByPath(todo.filePath);
    if (!(file instanceof TFile)) return;

    const content = await this.app.vault.read(file);
    const lines = content.split("\n");
    const lineIndex = todo.lineNumber - 1;
    if (lineIndex < 0 || lineIndex >= lines.length) return;

    const line = lines[lineIndex];
    lines[lineIndex] = todo.completed
      ? line.replace(/- \[[xX]\]/, "- [ ]")
      : line.replace(/- \[ \]/, "- [x]");

    await this.app.vault.modify(file, lines.join("\n"));
    await this.refresh();
  }

  private priorityRank(p: TodoItem["priority"]): number {
    switch (p) {
      case "high":   return 0;
      case "medium": return 1;
      case "low":    return 2;
      default:       return 3;
    }
  }

  private groupKey(todo: TodoItem): string {
    return `${todo.sourceType}:${todo.date ?? "undated"}:${todo.sourceName}`;
  }

  private formatGroupLabel(key: string): string {
    const parts = key.split(":");
    const type = parts[0] as SourceType;
    const date = parts[1];
    const name = parts.slice(2).join(":");
    if (date === "undated") return `${name} (${this.sourceTypeLabel(type)})`;
    return `${date} ${name}`;
  }

  private sortKeyForGroup(key: string): string {
    const parts = key.split(":");
    const type = parts[0];
    const date = parts[1];
    const order = ["daily", "meeting", "recurring", "other"];
    const dateSort = date === "undated" ? "0000-00-00" : date;
    return `${dateSort}:${String(order.indexOf(type)).padStart(2, "0")}`;
  }

  private sourceTypeLabel(type: SourceType): string {
    switch (type) {
      case "daily":     return "Daily";
      case "meeting":   return "Meeting";
      case "recurring": return "Recurring";
      case "other":     return "Other";
    }
  }

  async onClose() {}
}

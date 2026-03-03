import { App, ItemView, WorkspaceLeaf, TFile } from "obsidian";
import { VIEW_TYPE_RIGHT_SIDEBAR, TodoItem } from "../types";
import { extractTodos } from "../utils/todoExtractor";
import { toDateStr } from "../utils/dateUtils";

export class RightSidebarView extends ItemView {
  private showCompleted: boolean = false;
  private todos: TodoItem[] = [];
  private collapsedSections: Set<string> = new Set();
  private onTodoClick: (filePath: string, line: number) => void;

  constructor(leaf: WorkspaceLeaf, onTodoClick: (filePath: string, line: number) => void) {
    super(leaf);
    this.onTodoClick = onTodoClick;
  }

  getViewType(): string {
    return VIEW_TYPE_RIGHT_SIDEBAR;
  }

  getDisplayText(): string {
    return "To-Do Items";
  }

  getIcon(): string {
    return "check-square";
  }

  async onOpen() {
    await this.refresh();
  }

  async refresh() {
    this.todos = await extractTodos(this.app);
    this.render();
  }

  private render() {
    const container = this.containerEl.children[1] as HTMLElement;
    container.empty();
    container.addClass("rays-right-sidebar");

    // Header with toggle
    const header = container.createDiv({ cls: "rays-todo-header" });
    header.createEl("h4", { text: "To Do Items" });

    const toggleLabel = header.createEl("label", { cls: "rays-todo-switch" });
    const checkbox = toggleLabel.createEl("input", { type: "checkbox" });
    checkbox.checked = this.showCompleted;
    checkbox.addEventListener("change", () => {
      this.showCompleted = checkbox.checked;
      this.render();
    });
    toggleLabel.createSpan({ cls: "rays-todo-slider" });
    toggleLabel.createSpan({ cls: "rays-todo-switch-label", text: "Done" });

    // Filter todos
    const filtered = this.showCompleted
      ? this.todos
      : this.todos.filter((t) => !t.completed);

    if (filtered.length === 0) {
      const emptyState = container.createDiv({ cls: "rays-todo-empty" });
      emptyState.createDiv({ cls: "rays-todo-empty-icon", text: "\u2714" });
      emptyState.createDiv({
        cls: "rays-todo-empty-text",
        text: this.showCompleted ? "No tasks found" : "All caught up!",
      });
      return;
    }

    // Group by source type
    const groups = new Map<string, TodoItem[]>();
    for (const todo of filtered) {
      const key = this.groupKey(todo);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(todo);
    }

    // Sort groups by date (recent first), then by type
    const sortedKeys = [...groups.keys()].sort((a, b) => {
      return this.sortKeyForGroup(b).localeCompare(this.sortKeyForGroup(a));
    });

    const todayStr = toDateStr(new Date());

    for (const key of sortedKeys) {
      const items = groups.get(key)!;

      // Sort items within group: priority (high→med→low→none), then due date (earliest first, null last)
      items.sort((a, b) => {
        const pa = this.priorityRank(a.priority);
        const pb = this.priorityRank(b.priority);
        if (pa !== pb) return pa - pb;

        const da = a.dueDate || "9999-99-99";
        const db = b.dueDate || "9999-99-99";
        return da.localeCompare(db);
      });

      const isCollapsed = this.collapsedSections.has(key);
      const sourceType = key.split(":")[0];

      const section = container.createDiv({ cls: `rays-todo-section` });

      // Section header (collapsible)
      const sectionHeader = section.createDiv({ cls: "rays-todo-section-header" });
      const headerLeft = sectionHeader.createDiv({ cls: "rays-todo-section-header-left" });
      headerLeft.createSpan({ cls: `rays-todo-arrow ${isCollapsed ? "collapsed" : ""}` });
      headerLeft.createSpan({ cls: "rays-todo-section-label", text: this.formatGroupLabel(key) });
      sectionHeader.createSpan({ cls: "rays-todo-section-count", text: String(items.length) });

      sectionHeader.addEventListener("click", () => {
        if (this.collapsedSections.has(key)) {
          this.collapsedSections.delete(key);
        } else {
          this.collapsedSections.add(key);
        }
        this.render();
      });

      if (isCollapsed) continue;

      // Items
      const list = section.createDiv({ cls: "rays-todo-list" });
      for (const todo of items) {
        const priorityCls = todo.priority ? ` priority-${todo.priority}` : "";
        const completedCls = todo.completed ? " completed" : "";
        const item = list.createDiv({ cls: `rays-todo-item${completedCls}${priorityCls}` });

        // Custom checkbox
        const checkEl = item.createDiv({ cls: `rays-todo-checkbox ${todo.completed ? "checked" : ""}` });
        if (todo.completed) {
          checkEl.createSpan({ cls: "rays-todo-checkmark" });
        }
        checkEl.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.toggleTodo(todo);
        });

        // Content column
        const content = item.createDiv({ cls: "rays-todo-content" });

        // Top row: priority pill + text
        const topRow = content.createDiv({ cls: "rays-todo-top-row" });

        if (todo.priority) {
          const priorityLabels = { high: "High", medium: "Med", low: "Low" };
          topRow.createSpan({
            cls: `rays-todo-priority rays-todo-priority-${todo.priority}`,
            text: priorityLabels[todo.priority],
          });
        }

        const textSpan = topRow.createSpan({ cls: "rays-todo-text", text: todo.text });
        textSpan.addEventListener("click", (e) => {
          e.preventDefault();
          this.onTodoClick(todo.filePath, todo.lineNumber);
        });

        // Due date (below text if present)
        if (todo.dueDate) {
          let dueCls = "rays-todo-due future";
          let dueLabel = todo.dueDate;
          if (!todo.completed) {
            if (todo.dueDate < todayStr) {
              dueCls = "rays-todo-due overdue";
              dueLabel = `Overdue \u00B7 ${todo.dueDate}`;
            } else if (todo.dueDate === todayStr) {
              dueCls = "rays-todo-due due-today";
              dueLabel = "Due today";
            }
          }
          content.createDiv({ cls: dueCls, text: dueLabel });
        }
      }
    }
  }

  private async toggleTodo(todo: TodoItem) {
    const file = this.app.vault.getAbstractFileByPath(todo.filePath);
    if (!(file instanceof TFile)) return;

    const content = await this.app.vault.read(file);
    const lines = content.split("\n");
    const lineIndex = todo.lineNumber - 1;

    if (lineIndex < 0 || lineIndex >= lines.length) return;

    const line = lines[lineIndex];
    if (todo.completed) {
      lines[lineIndex] = line.replace(/- \[[xX]\]/, "- [ ]");
    } else {
      lines[lineIndex] = line.replace(/- \[ \]/, "- [x]");
    }

    await this.app.vault.modify(file, lines.join("\n"));
    await this.refresh();
  }

  private priorityRank(p: TodoItem["priority"]): number {
    switch (p) {
      case "high": return 0;
      case "medium": return 1;
      case "low": return 2;
      default: return 3;
    }
  }

  private groupKey(todo: TodoItem): string {
    const date = todo.date || "undated";
    return `${todo.sourceType}:${date}:${todo.sourceName}`;
  }

  private formatGroupLabel(key: string): string {
    const parts = key.split(":");
    const type = parts[0] as TodoItem["sourceType"];
    const date = parts[1];
    const name = parts.slice(2).join(":"); // name might contain colons
    if (date === "undated") {
      return `${name} (${this.sourceTypeLabel(type)})`;
    }
    return `${date} ${name}`;
  }

  private sortKeyForGroup(key: string): string {
    const parts = key.split(":");
    const type = parts[0];
    const date = parts[1];
    const order = ["daily", "meeting", "recurring", "other"];
    // Sort by date descending (recent first), then by type order
    const dateSort = date === "undated" ? "0000-00-00" : date;
    return `${dateSort}:${String(order.indexOf(type)).padStart(2, "0")}`;
  }

  private sourceTypeLabel(type: TodoItem["sourceType"]): string {
    switch (type) {
      case "daily": return "Daily";
      case "meeting": return "Meeting";
      case "recurring": return "Recurring";
      case "other": return "Other";
    }
  }

  async onClose() {
    // cleanup
  }
}

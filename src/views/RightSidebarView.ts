import { App, ItemView, WorkspaceLeaf, TFile } from "obsidian";
import { VIEW_TYPE_RIGHT_SIDEBAR, TodoItem } from "../types";
import { extractTodos } from "../utils/todoExtractor";

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
      container.createDiv({
        cls: "rays-empty-message",
        text: this.showCompleted ? "No tasks found" : "No open tasks found",
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

    for (const key of sortedKeys) {
      const items = groups.get(key)!;
      const section = container.createDiv({ cls: "rays-todo-section" });
      const isCollapsed = this.collapsedSections.has(key);

      // Section header (collapsible)
      const sectionHeader = section.createDiv({ cls: "rays-todo-section-header" });
      const arrow = sectionHeader.createSpan({ cls: "rays-todo-arrow", text: isCollapsed ? "\u25B6" : "\u25BC" });
      sectionHeader.createSpan({ text: ` ${this.formatGroupLabel(key)} (${items.length})` });
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
      const list = section.createEl("ul", { cls: "rays-todo-list" });
      for (const todo of items) {
        const li = list.createEl("li", { cls: `rays-todo-item ${todo.completed ? "completed" : ""}` });

        const checkSpan = li.createSpan({ cls: "rays-todo-check", text: todo.completed ? "\u2611" : "\u2610" });
        checkSpan.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.toggleTodo(todo);
        });

        const textSpan = li.createSpan({ cls: "rays-todo-text", text: todo.text });
        textSpan.addEventListener("click", (e) => {
          e.preventDefault();
          this.onTodoClick(todo.filePath, todo.lineNumber);
        });
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

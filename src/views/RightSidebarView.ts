import { App, ItemView, WorkspaceLeaf, TFile } from "obsidian";
import { VIEW_TYPE_RIGHT_SIDEBAR, TodoItem } from "../types";
import { extractTodos } from "../utils/todoExtractor";
import { toDateStr } from "../utils/dateUtils";

const PRIORITY_LABELS: Record<string, string> = { high: "High", medium: "Med", low: "Low" };

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

    this.renderHeader(container);

    const filtered = this.showCompleted
      ? this.todos
      : this.todos.filter((t) => !t.completed);

    if (filtered.length === 0) {
      this.renderEmptyState(container);
      return;
    }

    const sortedGroups = this.groupAndSort(filtered);
    const todayStr = toDateStr(new Date());

    for (const { key, items } of sortedGroups) {
      this.renderSection(container, key, items, todayStr);
    }
  }

  private renderHeader(container: HTMLElement) {
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
  }

  private renderEmptyState(container: HTMLElement) {
    const emptyState = container.createDiv({ cls: "rays-todo-empty" });
    emptyState.createDiv({ cls: "rays-todo-empty-icon", text: "\u2714" });
    emptyState.createDiv({
      cls: "rays-todo-empty-text",
      text: this.showCompleted ? "No tasks found" : "All caught up!",
    });
  }

  private groupAndSort(filtered: TodoItem[]): { key: string; items: TodoItem[] }[] {
    const groups = new Map<string, TodoItem[]>();
    for (const todo of filtered) {
      const key = this.groupKey(todo);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(todo);
    }

    const sortedKeys = [...groups.keys()].sort((a, b) => {
      return this.sortKeyForGroup(b).localeCompare(this.sortKeyForGroup(a));
    });

    return sortedKeys.map((key) => {
      const items = groups.get(key)!;
      items.sort((a, b) => {
        const pa = this.priorityRank(a.priority);
        const pb = this.priorityRank(b.priority);
        if (pa !== pb) return pa - pb;
        const da = a.dueDate || "9999-99-99";
        const db = b.dueDate || "9999-99-99";
        return da.localeCompare(db);
      });
      return { key, items };
    });
  }

  private renderSection(container: HTMLElement, key: string, items: TodoItem[], todayStr: string) {
    const isCollapsed = this.collapsedSections.has(key);
    const section = container.createDiv({ cls: "rays-todo-section" });

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

    const checkEl = item.createDiv({ cls: `rays-todo-checkbox ${todo.completed ? "checked" : ""}` });
    if (todo.completed) {
      checkEl.createSpan({ cls: "rays-todo-checkmark" });
    }
    checkEl.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.toggleTodo(todo);
    });

    const content = item.createDiv({ cls: "rays-todo-content" });
    const topRow = content.createDiv({ cls: "rays-todo-top-row" });

    if (todo.priority) {
      topRow.createSpan({
        cls: `rays-todo-priority rays-todo-priority-${todo.priority}`,
        text: PRIORITY_LABELS[todo.priority],
      });
    }

    const textSpan = topRow.createSpan({ cls: "rays-todo-text", text: todo.text });
    textSpan.addEventListener("click", (e) => {
      e.preventDefault();
      this.onTodoClick(todo.filePath, todo.lineNumber);
    });

    if (todo.dueDate) {
      this.renderDueDateBadge(content, todo, todayStr);
    }
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
    const name = parts.slice(2).join(":");
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

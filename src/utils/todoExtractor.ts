import { App, TFile, MarkdownView } from "obsidian";
import { TodoItem } from "../types";

function classifyFile(path: string, basename: string): { sourceType: TodoItem["sourceType"]; sourceName: string; date: string | null } {
  // Daily Notes/YYYY-MM-DD.md
  const dailyMatch = path.match(/^Daily Notes\/(\d{4}-\d{2}-\d{2})\.md$/);
  if (dailyMatch) {
    return { sourceType: "daily", sourceName: "Daily", date: dailyMatch[1] };
  }
  // meetings/recurring/person.md
  if (path.startsWith("meetings/recurring/")) {
    return { sourceType: "recurring", sourceName: basename, date: null };
  }
  // meetings/YYYY-MM-DD/something.md
  const meetingMatch = path.match(/^meetings\/(\d{4}-\d{2}-\d{2})\/.+\.md$/);
  if (meetingMatch) {
    return { sourceType: "meeting", sourceName: basename, date: meetingMatch[1] };
  }
  return { sourceType: "other", sourceName: basename, date: null };
}

/** Parse priority (!!!, !!, !) and due date (📅 YYYY-MM-DD or due:YYYY-MM-DD) from raw todo text */
function parseMetadata(rawText: string): { text: string; priority: TodoItem["priority"]; dueDate: string | null } {
  let text = rawText;
  let dueDate: string | null = null;
  let priority: TodoItem["priority"] = null;

  // Extract due date: 📅 YYYY-MM-DD or due:YYYY-MM-DD (strip from display text)
  const dueDateMatch = text.match(/(?:📅\s*|due:)(\d{4}-\d{2}-\d{2})/);
  if (dueDateMatch) {
    dueDate = dueDateMatch[1];
    text = text.replace(/\s*(?:📅\s*|due:)\d{4}-\d{2}-\d{2}\s*/, " ").trim();
  }

  // Extract priority: !!! / !! / ! at the start (strip from display text)
  const priorityMatch = text.match(/^(!{1,3})\s+/);
  if (priorityMatch) {
    const bangs = priorityMatch[1];
    if (bangs === "!!!") priority = "high";
    else if (bangs === "!!") priority = "medium";
    else priority = "low";
    text = text.slice(priorityMatch[0].length);
  }

  return { text, priority, dueDate };
}

export async function extractTodos(app: App): Promise<TodoItem[]> {
  const todos: TodoItem[] = [];
  const files = app.vault.getMarkdownFiles();

  // Get live editor content for the active file (hasn't been flushed to vault yet)
  let activeFilePath: string | null = null;
  let activeContent: string | null = null;
  const activeView = app.workspace.getActiveViewOfType(MarkdownView);
  if (activeView?.file) {
    activeFilePath = activeView.file.path;
    activeContent = activeView.editor.getValue();
  }

  for (const file of files) {
    const content = file.path === activeFilePath && activeContent !== null
      ? activeContent
      : await app.vault.cachedRead(file);
    const lines = content.split("\n");
    const { sourceType, sourceName, date } = classifyFile(file.path, file.basename);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Match - [ ] or - [x] or - [X]
      const unchecked = line.match(/^(\s*)-\s\[\s\]\s+(.+)$/);
      if (unchecked) {
        const { text, priority, dueDate } = parseMetadata(unchecked[2].trim());
        todos.push({
          text,
          completed: false,
          filePath: file.path,
          lineNumber: i + 1,
          sourceType,
          sourceName,
          date,
          priority,
          dueDate,
        });
        continue;
      }
      const checked = line.match(/^(\s*)-\s\[[xX]\]\s+(.+)$/);
      if (checked) {
        const { text, priority, dueDate } = parseMetadata(checked[2].trim());
        todos.push({
          text,
          completed: true,
          filePath: file.path,
          lineNumber: i + 1,
          sourceType,
          sourceName,
          date,
          priority,
          dueDate,
        });
      }
    }
  }

  return todos;
}

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
        todos.push({
          text: unchecked[2].trim(),
          completed: false,
          filePath: file.path,
          lineNumber: i + 1,
          sourceType,
          sourceName,
          date,
        });
        continue;
      }
      const checked = line.match(/^(\s*)-\s\[[xX]\]\s+(.+)$/);
      if (checked) {
        todos.push({
          text: checked[2].trim(),
          completed: true,
          filePath: file.path,
          lineNumber: i + 1,
          sourceType,
          sourceName,
          date,
        });
      }
    }
  }

  return todos;
}

export const VIEW_TYPE_LEFT_SIDEBAR = "dayflow-left-sidebar";
export const VIEW_TYPE_RIGHT_SIDEBAR = "dayflow-right-sidebar";

export interface TodoItem {
  text: string;
  completed: boolean;
  filePath: string;
  lineNumber: number;
  sourceType: "daily" | "meeting" | "recurring" | "other";
  sourceName: string; // "Daily", person name, topic name, or filename
  date: string | null; // YYYY-MM-DD or null if not in a dated folder
  priority: "high" | "medium" | "low" | null; // !!! = high, !! = medium, ! = low
  dueDate: string | null; // YYYY-MM-DD from 📅 emoji syntax
}

export interface DateChangeEvent {
  date: Date;
  dateStr: string; // YYYY-MM-DD
}

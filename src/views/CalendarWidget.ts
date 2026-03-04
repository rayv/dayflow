import { App, TFile, TFolder } from "obsidian";
import {
  getDaysInMonth,
  getFirstDayOfMonth,
  getMonthName,
  isSameDay,
  toDateStr,
  dailyNotePath,
  meetingsFolderPath,
  recurringFolderPath,
  parseH1Date,
} from "../utils/dateUtils";

interface DayInfo {
  hasDaily: boolean;
  hasMeetings: boolean;
  hasRecurring: boolean;
}

export class CalendarWidget {
  private containerEl: HTMLElement;
  private app: App;
  private currentMonth: number;
  private currentYear: number;
  private selectedDate: Date;
  private showWeekends: boolean = false;
  private onDateSelect: (date: Date) => void;

  constructor(parentEl: HTMLElement, app: App, onDateSelect: (date: Date) => void) {
    this.containerEl = parentEl.createDiv({ cls: "rays-calendar" });
    this.app = app;
    this.onDateSelect = onDateSelect;
    const today = new Date();
    this.selectedDate = today;
    this.currentMonth = today.getMonth();
    this.currentYear = today.getFullYear();
    this.render();
  }

  setSelectedDate(date: Date) {
    this.selectedDate = date;
    this.currentMonth = date.getMonth();
    this.currentYear = date.getFullYear();
    this.render();
  }

  private async render() {
    this.containerEl.empty();

    // Header: < Month Year >
    const header = this.containerEl.createDiv({ cls: "rays-calendar-header" });

    const prevBtn = header.createEl("button", { cls: "rays-calendar-nav", text: "\u25C0" });
    prevBtn.addEventListener("click", () => this.prevMonth());

    header.createEl("span", {
      cls: "rays-calendar-title",
      text: `${getMonthName(this.currentMonth)} ${this.currentYear}`,
    });

    const nextBtn = header.createEl("button", { cls: "rays-calendar-nav", text: "\u25B6" });
    nextBtn.addEventListener("click", () => this.nextMonth());

    // Weekend toggle
    const toggleRow = this.containerEl.createDiv({ cls: "rays-calendar-toggle" });
    const label = toggleRow.createEl("label", { cls: "rays-calendar-weekend-label" });
    const checkbox = label.createEl("input", { type: "checkbox" });
    checkbox.checked = this.showWeekends;
    checkbox.addEventListener("change", () => {
      this.showWeekends = checkbox.checked;
      this.render();
    });
    label.appendText(" Show weekends");

    // Pre-compute day info for the month
    const dayInfoMap = await this.computeMonthDayInfo();

    // Day headers
    const grid = this.containerEl.createDiv({ cls: "rays-calendar-grid" });
    const dayLabels = this.showWeekends
      ? ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
      : ["Mon", "Tue", "Wed", "Thu", "Fri"];

    for (const d of dayLabels) {
      grid.createDiv({ cls: "rays-calendar-day-header", text: d });
    }

    // Calendar days
    const daysInMonth = getDaysInMonth(this.currentYear, this.currentMonth);
    const firstDay = getFirstDayOfMonth(this.currentYear, this.currentMonth);
    const today = new Date();

    let startOffset: number;
    if (this.showWeekends) {
      startOffset = firstDay;
    } else {
      startOffset = firstDay === 0 ? 5 : firstDay - 1;
    }

    for (let i = 0; i < startOffset; i++) {
      grid.createDiv({ cls: "rays-calendar-day empty" });
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(this.currentYear, this.currentMonth, day);
      const dayOfWeek = date.getDay();

      if (!this.showWeekends && (dayOfWeek === 0 || dayOfWeek === 6)) continue;

      const cls = ["rays-calendar-day"];
      if (isSameDay(date, today)) cls.push("today");
      if (isSameDay(date, this.selectedDate)) cls.push("selected");

      const cell = grid.createDiv({ cls: cls.join(" ") });

      const dayNumber = cell.createSpan({ cls: "rays-calendar-day-number", text: String(day) });

      // Dots
      const dateStr = toDateStr(date);
      const info = dayInfoMap.get(dateStr) || { hasDaily: false, hasMeetings: false, hasRecurring: false };
      const dots = cell.createDiv({ cls: "rays-calendar-dots" });
      dots.createSpan({ cls: `rays-dot rays-dot-daily ${info.hasDaily ? "filled" : ""}` });
      dots.createSpan({ cls: `rays-dot rays-dot-meeting ${info.hasMeetings ? "filled" : ""}` });
      dots.createSpan({ cls: `rays-dot rays-dot-recurring ${info.hasRecurring ? "filled" : ""}` });

      cell.addEventListener("click", () => {
        this.selectedDate = date;
        this.onDateSelect(date);
        this.render();
      });
    }
  }

  private async computeMonthDayInfo(): Promise<Map<string, DayInfo>> {
    const map = new Map<string, DayInfo>();
    const daysInMonth = getDaysInMonth(this.currentYear, this.currentMonth);

    // Pre-compute recurring dates for the month
    const recurringDates = await this.getRecurringDatesInMonth();

    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(this.currentYear, this.currentMonth, day);
      const dateStr = toDateStr(date);

      // Check daily note
      const hasDaily = this.app.vault.getAbstractFileByPath(dailyNotePath(dateStr)) instanceof TFile;

      // Check one-off meetings
      let hasMeetings = false;
      const meetingsFolder = this.app.vault.getAbstractFileByPath(meetingsFolderPath(dateStr));
      if (meetingsFolder instanceof TFolder) {
        hasMeetings = meetingsFolder.children.some(
          (f) => f instanceof TFile && f.extension === "md"
        );
      }

      // Check recurring
      const hasRecurring = recurringDates.has(dateStr);

      map.set(dateStr, { hasDaily, hasMeetings, hasRecurring });
    }

    return map;
  }

  private async getRecurringDatesInMonth(): Promise<Set<string>> {
    const dates = new Set<string>();
    const folder = this.app.vault.getAbstractFileByPath(recurringFolderPath());
    if (!(folder instanceof TFolder)) return dates;

    for (const child of folder.children) {
      if (!(child instanceof TFile) || child.extension !== "md") continue;
      const content = await this.app.vault.cachedRead(child);
      const lines = content.split("\n");
      for (const line of lines) {
        const match = line.match(/^#\s+(.+)$/);
        if (match) {
          const parsed = parseH1Date(match[1]);
          if (parsed &&
            parsed.getMonth() === this.currentMonth &&
            parsed.getFullYear() === this.currentYear) {
            dates.add(toDateStr(parsed));
          }
        }
      }
    }

    return dates;
  }

  private prevMonth() {
    this.currentMonth--;
    if (this.currentMonth < 0) {
      this.currentMonth = 11;
      this.currentYear--;
    }
    this.render();
  }

  private nextMonth() {
    this.currentMonth++;
    if (this.currentMonth > 11) {
      this.currentMonth = 0;
      this.currentYear++;
    }
    this.render();
  }

  getShowWeekends(): boolean {
    return this.showWeekends;
  }

  destroy() {
    this.containerEl.remove();
  }
}

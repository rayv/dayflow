import { App, TFile, TFolder } from "obsidian";
import {
  toDateStr,
  dailyNotePath,
  meetingsFolderPath,
  recurringFolderPath,
  parseH1Date,
  isSameDay,
} from "../utils/dateUtils";
import { extractTodos } from "../utils/todoExtractor";

interface WeekDayInfo {
  hasDaily: boolean;
  hasMeetings: boolean;
  hasRecurring: boolean;
  incompleteTodoCount: number;
}

const DAY_NAMES_WEEKDAY = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const DAY_NAMES_WEEKEND = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export class WeekStripWidget {
  private containerEl: HTMLElement;
  private app: App;
  private weekStart: Date;
  private selectedDate: Date;
  private onDateSelect: (date: Date) => void;
  private getShowWeekends: () => boolean;

  constructor(
    parentEl: HTMLElement,
    app: App,
    onDateSelect: (date: Date) => void,
    getShowWeekends: () => boolean,
  ) {
    this.containerEl = parentEl.createDiv({ cls: "rays-week-strip" });
    this.app = app;
    this.onDateSelect = onDateSelect;
    this.getShowWeekends = getShowWeekends;
    const today = new Date();
    this.selectedDate = new Date(today);
    this.weekStart = this.computeWeekStart(today);
  }

  /** Navigate to date's week and update selection — does NOT re-render; caller must call refresh(). */
  navigateToDate(date: Date) {
    this.selectedDate = new Date(date);
    this.weekStart = this.computeWeekStart(date);
  }

  /** Re-render with current weekStart and selectedDate, fetching fresh vault data. */
  async refresh() {
    await this.render();
  }

  private computeWeekStart(date: Date): Date {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    if (this.getShowWeekends()) {
      // Week starts Sunday
      d.setDate(d.getDate() - d.getDay());
    } else {
      // Week starts Monday
      const day = d.getDay(); // 0=Sun
      d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
    }
    return d;
  }

  private getWeekDays(): Date[] {
    const count = this.getShowWeekends() ? 7 : 5;
    return Array.from({ length: count }, (_, i) => {
      const d = new Date(this.weekStart);
      d.setDate(d.getDate() + i);
      return d;
    });
  }

  private formatWeekLabel(days: Date[]): string {
    const first = days[0];
    const last = days[days.length - 1];
    if (first.getMonth() === last.getMonth()) {
      return `${MONTHS_SHORT[first.getMonth()]} ${first.getDate()}–${last.getDate()}`;
    }
    return `${MONTHS_SHORT[first.getMonth()]} ${first.getDate()} – ${MONTHS_SHORT[last.getMonth()]} ${last.getDate()}`;
  }

  private async render() {
    this.containerEl.empty();
    const today = new Date();
    const weekDays = this.getWeekDays();
    const showWeekends = this.getShowWeekends();
    const todayInWeek = weekDays.some((d) => isSameDay(d, today));

    // Fetch data
    const dayInfoMap = await this.computeWeekDayInfo(weekDays);

    // Header
    const header = this.containerEl.createDiv({ cls: "rays-week-strip-header" });

    const prevBtn = header.createEl("button", { cls: "rays-week-strip-nav", text: "\u25C0" });
    prevBtn.setAttribute("aria-label", "Previous week");
    prevBtn.addEventListener("click", () => {
      this.weekStart.setDate(this.weekStart.getDate() - 7);
      this.render();
    });

    const labelArea = header.createDiv({ cls: "rays-week-strip-label-area" });
    labelArea.createSpan({ cls: "rays-week-strip-label", text: this.formatWeekLabel(weekDays) });
    if (!todayInWeek) {
      const todayPill = labelArea.createEl("button", { cls: "rays-week-strip-today-pill", text: "Today" });
      todayPill.setAttribute("aria-label", "Jump to current week");
      todayPill.addEventListener("click", () => {
        this.weekStart = this.computeWeekStart(new Date());
        this.render();
      });
    }

    const nextBtn = header.createEl("button", { cls: "rays-week-strip-nav", text: "\u25B6" });
    nextBtn.setAttribute("aria-label", "Next week");
    nextBtn.addEventListener("click", () => {
      this.weekStart.setDate(this.weekStart.getDate() + 7);
      this.render();
    });

    // Day grid
    const dayNames = showWeekends ? DAY_NAMES_WEEKEND : DAY_NAMES_WEEKDAY;
    const grid = this.containerEl.createDiv({
      cls: `rays-week-strip-grid${showWeekends ? " show-weekends" : ""}`,
    });

    for (let i = 0; i < weekDays.length; i++) {
      const date = weekDays[i];
      const dateStr = toDateStr(date);
      const info = dayInfoMap.get(dateStr) ?? {
        hasDaily: false,
        hasMeetings: false,
        hasRecurring: false,
        incompleteTodoCount: 0,
      };
      const isToday = isSameDay(date, today);
      const isSelected = isSameDay(date, this.selectedDate);

      const cls = ["rays-week-strip-day"];
      if (isToday) cls.push("today");
      if (isSelected) cls.push("selected");

      const cell = grid.createDiv({ cls: cls.join(" ") });
      cell.setAttribute("role", "button");
      cell.setAttribute("aria-label", `${dayNames[i]} ${date.getDate()}, ${info.incompleteTodoCount} todos`);
      cell.setAttribute("aria-pressed", String(isSelected));

      cell.createSpan({ cls: "rays-week-strip-day-name", text: dayNames[i] });
      cell.createSpan({ cls: "rays-week-strip-day-num", text: String(date.getDate()) });

      const dots = cell.createDiv({ cls: "rays-calendar-dots" });
      dots.createSpan({ cls: `rays-dot rays-dot-daily${info.hasDaily ? " filled" : ""}` });
      dots.createSpan({ cls: `rays-dot rays-dot-meeting${info.hasMeetings ? " filled" : ""}` });
      dots.createSpan({ cls: `rays-dot rays-dot-recurring${info.hasRecurring ? " filled" : ""}` });

      const count = info.incompleteTodoCount;
      cell.createSpan({
        cls: `rays-week-strip-todo-count${count === 0 ? " zero" : ""}`,
        text: count === 0 ? "\u00B7" : String(count),
      });

      cell.addEventListener("click", () => {
        this.selectedDate = date;
        this.onDateSelect(date);
      });
    }
  }

  private async computeWeekDayInfo(days: Date[]): Promise<Map<string, WeekDayInfo>> {
    const map = new Map<string, WeekDayInfo>();
    const targetStrs = new Set(days.map(toDateStr));

    // Recurring dates that fall in this week
    const recurringDates = await this.getRecurringDatesForDays(targetStrs);

    // Incomplete todo counts by date
    const todos = await extractTodos(this.app);
    const todoCounts = new Map<string, number>();
    for (const todo of todos) {
      if (!todo.completed && todo.date && targetStrs.has(todo.date)) {
        todoCounts.set(todo.date, (todoCounts.get(todo.date) ?? 0) + 1);
      }
    }

    for (const date of days) {
      const dateStr = toDateStr(date);
      const hasDaily = this.app.vault.getAbstractFileByPath(dailyNotePath(dateStr)) instanceof TFile;

      let hasMeetings = false;
      const mf = this.app.vault.getAbstractFileByPath(meetingsFolderPath(dateStr));
      if (mf instanceof TFolder) {
        hasMeetings = mf.children.some((f) => f instanceof TFile && f.extension === "md");
      }

      map.set(dateStr, {
        hasDaily,
        hasMeetings,
        hasRecurring: recurringDates.has(dateStr),
        incompleteTodoCount: todoCounts.get(dateStr) ?? 0,
      });
    }

    return map;
  }

  private async getRecurringDatesForDays(targetStrs: Set<string>): Promise<Set<string>> {
    const dates = new Set<string>();
    const folder = this.app.vault.getAbstractFileByPath(recurringFolderPath());
    if (!(folder instanceof TFolder)) return dates;

    for (const child of folder.children) {
      if (!(child instanceof TFile) || child.extension !== "md") continue;
      const content = await this.app.vault.cachedRead(child);
      for (const line of content.split("\n")) {
        const match = line.match(/^#\s+(.+)$/);
        if (match) {
          const parsed = parseH1Date(match[1]);
          if (parsed) {
            const ds = toDateStr(parsed);
            if (targetStrs.has(ds)) dates.add(ds);
          }
        }
      }
    }

    return dates;
  }

  destroy() {
    this.containerEl.remove();
  }
}

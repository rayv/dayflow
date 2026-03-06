import { App, ItemView, TFile, WorkspaceLeaf, setIcon } from "obsidian";
import { VIEW_TYPE_LEFT_SIDEBAR } from "../types";
import { CalendarWidget } from "./CalendarWidget";
import { WeekStripWidget } from "./WeekStripWidget";
import { DailyOutline } from "./DailyOutline";
import { MeetingsPanel } from "./MeetingsPanel";
import { RecurringPanel } from "./RecurringPanel";
import { toDateStr, fromDateStr, dailyNotePath } from "../utils/dateUtils";

export interface LeftSidebarConfig {
  showWeekends: boolean;
  defaultCalendarView: "week" | "month";
}

export class LeftSidebarView extends ItemView {
  private weekStrip: WeekStripWidget | null = null;
  private calendar: CalendarWidget | null = null;
  private dailyOutline: DailyOutline | null = null;
  private meetingsPanel: MeetingsPanel | null = null;
  private recurringPanel: RecurringPanel | null = null;
  private selectedDateStr: string;
  private showWeekends: boolean;
  private defaultCalendarView: "week" | "month";
  private openFileCallback: (file: TFile, line?: number) => void;
  private openRecurringCallback: (file: TFile, dateStr: string) => void;
  private createMeetingCallback: (dateStr: string, name: string) => void;
  private createDailyCallback: (dateStr: string) => void;
  private createRecurringCallback: (dateStr: string, name: string) => void;
  private fullDayFlowCallback: (dateStr: string) => void;
  private dateChangeCallback: (dateStr: string) => void;

  constructor(
    leaf: WorkspaceLeaf,
    openFileCallback: (file: TFile, line?: number) => void,
    openRecurringCallback: (file: TFile, dateStr: string) => void,
    createMeetingCallback: (dateStr: string, name: string) => void,
    createDailyCallback: (dateStr: string) => void,
    createRecurringCallback: (dateStr: string, name: string) => void,
    fullDayFlowCallback: (dateStr: string) => void,
    dateChangeCallback: (dateStr: string) => void,
    config: LeftSidebarConfig,
  ) {
    super(leaf);
    this.selectedDateStr = toDateStr(new Date());
    this.showWeekends = config.showWeekends;
    this.defaultCalendarView = config.defaultCalendarView;
    this.openFileCallback = openFileCallback;
    this.openRecurringCallback = openRecurringCallback;
    this.createMeetingCallback = createMeetingCallback;
    this.createDailyCallback = createDailyCallback;
    this.createRecurringCallback = createRecurringCallback;
    this.fullDayFlowCallback = fullDayFlowCallback;
    this.dateChangeCallback = dateChangeCallback;
  }

  getViewType(): string {
    return VIEW_TYPE_LEFT_SIDEBAR;
  }

  getDisplayText(): string {
    return "DayFlow";
  }

  getIcon(): string {
    return "map";
  }

  async onOpen() {
    const container = this.containerEl.children[1] as HTMLElement;
    container.empty();
    container.addClass("rays-left-sidebar");

    const onDaySelected = async (date: Date) => {
      this.selectedDateStr = toDateStr(date);
      await this.refreshPanels();
      const file = this.app.vault.getAbstractFileByPath(dailyNotePath(this.selectedDateStr));
      if (file instanceof TFile) this.openFileCallback(file);
      this.dateChangeCallback(this.selectedDateStr);
    };

    if (this.defaultCalendarView === "week") {
      this.weekStrip = new WeekStripWidget(
        container,
        this.app,
        onDaySelected,
        () => this.showWeekends,
      );
    } else {
      this.calendar = new CalendarWidget(
        container,
        this.app,
        async (date) => {
          this.weekStrip?.navigateToDate(date);
          await onDaySelected(date);
        },
        this.showWeekends,
      );
    }

    // Daily Outline
    this.dailyOutline = new DailyOutline(container, this.app, (file, line) => {
      this.openFileCallback(file, line);
    }, (dateStr) => {
      this.createDailyCallback(dateStr);
    });

    // Meetings
    this.meetingsPanel = new MeetingsPanel(container, this.app, (file) => {
      this.openFileCallback(file);
    }, (dateStr, name) => {
      this.createMeetingCallback(dateStr, name);
    });

    // Recurring
    this.recurringPanel = new RecurringPanel(container, this.app, (file, dateStr) => {
      this.openRecurringCallback(file, dateStr);
    }, (dateStr, name) => {
      this.createRecurringCallback(dateStr, name);
    });

    // Full Day Flow button
    const fdfBtn = container.createEl("button", { cls: "rays-fdf-btn" });
    const iconSpan = fdfBtn.createSpan({ cls: "rays-fdf-btn-icon" });
    setIcon(iconSpan, "book-open");
    fdfBtn.createSpan({ text: "Full Day Flow" });
    fdfBtn.addEventListener("click", () => {
      this.fullDayFlowCallback(this.selectedDateStr);
    });

    await this.refreshPanels();
  }

  async refreshPanels() {
    if (this.weekStrip) await this.weekStrip.refresh();
    if (this.dailyOutline) await this.dailyOutline.update(this.selectedDateStr);
    if (this.meetingsPanel) await this.meetingsPanel.update(this.selectedDateStr);
    if (this.recurringPanel) await this.recurringPanel.update(this.selectedDateStr);
  }

  getSelectedDateStr(): string {
    return this.selectedDateStr;
  }

  getShowWeekends(): boolean {
    return this.showWeekends;
  }

  async applyShowWeekends(value: boolean) {
    this.showWeekends = value;
    if (this.calendar) this.calendar.setShowWeekends(value);
    if (this.weekStrip) await this.weekStrip.refresh();
  }

  async setSelectedDate(dateStr: string) {
    this.selectedDateStr = dateStr;
    const date = fromDateStr(dateStr);
    if (this.calendar) this.calendar.setSelectedDate(date);
    this.weekStrip?.navigateToDate(date);
    await this.refreshPanels();
  }

  async onClose() {
    this.weekStrip?.destroy();
    this.calendar?.destroy();
    this.dailyOutline?.destroy();
    this.meetingsPanel?.destroy();
    this.recurringPanel?.destroy();
  }
}

import { App, ItemView, TFile, WorkspaceLeaf } from "obsidian";
import { VIEW_TYPE_LEFT_SIDEBAR } from "../types";
import { CalendarWidget } from "./CalendarWidget";
import { DailyOutline } from "./DailyOutline";
import { MeetingsPanel } from "./MeetingsPanel";
import { RecurringPanel } from "./RecurringPanel";
import { toDateStr, dailyNotePath } from "../utils/dateUtils";

export class LeftSidebarView extends ItemView {
  private calendar: CalendarWidget | null = null;
  private dailyOutline: DailyOutline | null = null;
  private meetingsPanel: MeetingsPanel | null = null;
  private recurringPanel: RecurringPanel | null = null;
  private selectedDateStr: string;
  private openFileCallback: (file: TFile, line?: number) => void;
  private openRecurringCallback: (file: TFile, dateStr: string) => void;
  private createMeetingCallback: (dateStr: string, name: string) => void;
  private createDailyCallback: (dateStr: string) => void;
  private createRecurringCallback: (dateStr: string, name: string) => void;

  constructor(
    leaf: WorkspaceLeaf,
    openFileCallback: (file: TFile, line?: number) => void,
    openRecurringCallback: (file: TFile, dateStr: string) => void,
    createMeetingCallback: (dateStr: string, name: string) => void,
    createDailyCallback: (dateStr: string) => void,
    createRecurringCallback: (dateStr: string, name: string) => void,
  ) {
    super(leaf);
    this.selectedDateStr = toDateStr(new Date());
    this.openFileCallback = openFileCallback;
    this.openRecurringCallback = openRecurringCallback;
    this.createMeetingCallback = createMeetingCallback;
    this.createDailyCallback = createDailyCallback;
    this.createRecurringCallback = createRecurringCallback;
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

    // Calendar
    this.calendar = new CalendarWidget(container, this.app, async (date) => {
      this.selectedDateStr = toDateStr(date);
      await this.refreshPanels();

      // Open daily note if it exists
      const file = this.app.vault.getAbstractFileByPath(dailyNotePath(this.selectedDateStr));
      if (file instanceof TFile) {
        this.openFileCallback(file);
      }
    });

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

    await this.refreshPanels();
  }

  async refreshPanels() {
    if (this.dailyOutline) await this.dailyOutline.update(this.selectedDateStr);
    if (this.meetingsPanel) await this.meetingsPanel.update(this.selectedDateStr);
    if (this.recurringPanel) await this.recurringPanel.update(this.selectedDateStr);
  }

  getSelectedDateStr(): string {
    return this.selectedDateStr;
  }

  async onClose() {
    this.calendar?.destroy();
    this.dailyOutline?.destroy();
    this.meetingsPanel?.destroy();
    this.recurringPanel?.destroy();
  }
}

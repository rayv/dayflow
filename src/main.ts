import { Plugin, TFile, MarkdownView, Notice } from "obsidian";
import { VIEW_TYPE_LEFT_SIDEBAR, VIEW_TYPE_RIGHT_SIDEBAR, VIEW_TYPE_FULL_DAY_FLOW } from "./types";
import { LeftSidebarView } from "./views/LeftSidebarView";
import { RightSidebarView } from "./views/RightSidebarView";
import { FullDayFlowView } from "./views/FullDayFlowView";
import { DayFlowSettings, DEFAULT_SETTINGS, DayFlowSettingTab } from "./settings";
import {
  toDateStr,
  dailyNotePath,
  dailyNotesFolderPath,
  meetingsFolderPath,
  recurringFolderPath,
  fromDateStr,
  formatH1Date,
} from "./utils/dateUtils";

export default class DayFlowPlugin extends Plugin {
  settings: DayFlowSettings = DEFAULT_SETTINGS;
  private isActive = false;
  private refreshTimer: ReturnType<typeof setTimeout> | null = null;

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  async onload() {
    await this.loadSettings();
    this.addSettingTab(new DayFlowSettingTab(this.app, this));
    // Register views
    this.registerView(VIEW_TYPE_LEFT_SIDEBAR, (leaf) =>
      new LeftSidebarView(
        leaf,
        (file, line) => this.openFile(file, line),
        (file, dateStr) => this.openRecurringMeeting(file, dateStr),
        (dateStr, name) => this.createMeetingNote(dateStr, name),
        (dateStr) => this.createDailyNote(dateStr),
        (dateStr, name) => this.createRecurringMeeting(dateStr, name),
        (dateStr) => this.openFullDayFlow(dateStr),
        (dateStr) => this.updateFullDayFlowViews(dateStr),
        {
          showWeekends: this.settings.showWeekends,
          defaultCalendarView: this.settings.defaultCalendarView,
        },
      )
    );

    this.registerView(VIEW_TYPE_RIGHT_SIDEBAR, (leaf) =>
      new RightSidebarView(leaf, (filePath, line) => {
        const file = this.app.vault.getAbstractFileByPath(filePath);
        if (file instanceof TFile) this.openFile(file, line);
      })
    );

    this.registerView(VIEW_TYPE_FULL_DAY_FLOW, (leaf) => {
      const view = new FullDayFlowView(leaf, toDateStr(new Date()));
      view.setOpenFileCallback((filePath, line) => {
        const file = this.app.vault.getAbstractFileByPath(filePath);
        if (file instanceof TFile) this.openFile(file, line);
      });
      view.setNavigateCallback((dateStr) => this.navigateFullDayFlow(dateStr));
      view.setSkipWeekendsCallback(() => this.getShowWeekends());
      return view;
    });

    // Ribbon icon
    this.addRibbonIcon("layout-dashboard", "Toggle DayFlow", () => {
      this.toggleMode();
    });

    // Commands
    this.addCommand({
      id: "toggle-dayflow",
      name: "Toggle DayFlow",
      callback: () => this.toggleMode(),
    });

    this.addCommand({
      id: "open-full-day-flow",
      name: "Open Full Day Flow",
      callback: () => {
        const leftLeaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_LEFT_SIDEBAR);
        const dateStr = leftLeaves.length > 0
          ? (leftLeaves[0].view as LeftSidebarView).getSelectedDateStr()
          : toDateStr(new Date());
        this.openFullDayFlow(dateStr);
      },
    });

    // Live editor changes — reads directly from editor buffer
    this.registerEvent(
      this.app.workspace.on("editor-change", () => this.scheduleRefresh())
    );
    // metadataCache fires after Obsidian processes file changes
    this.registerEvent(
      this.app.metadataCache.on("changed", () => this.scheduleRefresh())
    );
    // Structural changes (new files, deletes, renames)
    this.registerEvent(
      this.app.vault.on("create", () => this.scheduleRefresh())
    );
    this.registerEvent(
      this.app.vault.on("delete", () => this.scheduleRefresh())
    );
    this.registerEvent(
      this.app.vault.on("rename", () => this.scheduleRefresh())
    );

    // If Obsidian restored our views from a previous session, mark as active
    this.app.workspace.onLayoutReady(() => {
      const hasLeft = this.app.workspace.getLeavesOfType(VIEW_TYPE_LEFT_SIDEBAR).length > 0;
      const hasRight = this.app.workspace.getLeavesOfType(VIEW_TYPE_RIGHT_SIDEBAR).length > 0;
      if (hasLeft || hasRight) {
        this.isActive = true;
      }
    });
  }

  async onunload() {
    if (this.isActive) {
      await this.deactivate();
    }
  }

  /** Called by the settings tab when the showWeekends setting changes. */
  async applyShowWeekends(value: boolean) {
    const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_LEFT_SIDEBAR);
    await Promise.all(leaves.map((leaf) =>
      (leaf.view as LeftSidebarView).applyShowWeekends(value)
    ));
  }

  /** Called by the settings tab when the defaultCalendarView setting changes. */
  async reloadDayFlow() {
    if (!this.isActive) return;
    await this.deactivate();
    await this.activate();
  }

  private async toggleMode() {
    if (this.isActive) {
      await this.deactivate();
    } else {
      await this.activate();
    }
  }

  private async activate() {
    this.isActive = true;

    // Open left sidebar
    const leftLeaf = this.app.workspace.getLeftLeaf(false);
    if (leftLeaf) {
      await leftLeaf.setViewState({ type: VIEW_TYPE_LEFT_SIDEBAR, active: true });
    }

    // Open right sidebar
    const rightLeaf = this.app.workspace.getRightLeaf(false);
    if (rightLeaf) {
      await rightLeaf.setViewState({ type: VIEW_TYPE_RIGHT_SIDEBAR, active: true });
    }

    // Open today's daily note if it exists, otherwise the button will appear
    const today = toDateStr(new Date());
    const file = this.app.vault.getAbstractFileByPath(dailyNotePath(today));
    if (file instanceof TFile) {
      await this.openFile(file);
    }

    new Notice("DayFlow activated");
  }

  private async deactivate() {
    this.isActive = false;

    // Close our views
    this.app.workspace.detachLeavesOfType(VIEW_TYPE_LEFT_SIDEBAR);
    this.app.workspace.detachLeavesOfType(VIEW_TYPE_RIGHT_SIDEBAR);
    this.app.workspace.detachLeavesOfType(VIEW_TYPE_FULL_DAY_FLOW);

    new Notice("DayFlow deactivated");
  }

  async openFile(file: TFile, line?: number) {
    const leaf = this.app.workspace.getLeaf(false);
    await leaf.openFile(file);

    if (line !== undefined) {
      const view = leaf.view;
      if (view instanceof MarkdownView) {
        const editor = view.editor;
        editor.setCursor({ line, ch: 0 });
        editor.scrollIntoView({ from: { line, ch: 0 }, to: { line, ch: 0 } }, true);
      }
    }
  }

  async openFullDayFlow(dateStr: string) {
    // Reuse an existing Full Day Flow tab if one is open
    const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE_FULL_DAY_FLOW);
    if (existing.length > 0) {
      const view = existing[0].view as FullDayFlowView;
      await view.setDate(dateStr);
      this.app.workspace.setActiveLeaf(existing[0], { focus: true });
      return;
    }

    const leaf = this.app.workspace.getLeaf(true);
    await leaf.setViewState({
      type: VIEW_TYPE_FULL_DAY_FLOW,
      active: true,
      state: { dateStr },
    });
  }

  private getShowWeekends(): boolean {
    const leftLeaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_LEFT_SIDEBAR);
    if (leftLeaves.length > 0) {
      return (leftLeaves[0].view as LeftSidebarView).getShowWeekends();
    }
    return false;
  }

  private async navigateFullDayFlow(dateStr: string) {
    // Update the Full Day Flow view
    await this.updateFullDayFlowViews(dateStr);

    // Sync the left sidebar calendar to the new date
    const leftLeaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_LEFT_SIDEBAR);
    for (const leaf of leftLeaves) {
      const view = leaf.view as LeftSidebarView;
      view.setSelectedDate(dateStr);
    }
  }

  private async updateFullDayFlowViews(dateStr: string) {
    const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_FULL_DAY_FLOW);
    for (const leaf of leaves) {
      const view = leaf.view as FullDayFlowView;
      await view.setDate(dateStr);
    }
  }

  async openRecurringMeeting(file: TFile, dateStr: string) {
    const date = fromDateStr(dateStr);
    const h1Text = formatH1Date(date);

    const content = await this.app.vault.read(file);
    const lines = content.split("\n");
    let existingLine = -1;

    for (let i = 0; i < lines.length; i++) {
      const match = lines[i].match(/^#\s+(.+)$/);
      if (match && match[1].trim() === h1Text) {
        existingLine = i;
        break;
      }
    }

    if (existingLine === -1) {
      const newContent = `# ${h1Text}\n\n${content}`;
      await this.app.vault.modify(file, newContent);
      await this.openFile(file, 0);
    } else {
      await this.openFile(file, existingLine);
    }
  }

  async createMeetingNote(dateStr: string, name: string) {
    const folderPath = meetingsFolderPath(dateStr);

    // Ensure folder exists
    const folder = this.app.vault.getAbstractFileByPath(folderPath);
    if (!folder) {
      await this.app.vault.createFolder(folderPath);
    }

    const notePath = `${folderPath}/${name}.md`;
    const existing = this.app.vault.getAbstractFileByPath(notePath);
    if (existing instanceof TFile) {
      // Already exists, just open it
      await this.openFile(existing);
      return;
    }

    const file = await this.app.vault.create(notePath, "");
    await this.refreshLeftSidebar();
    await this.openFile(file);
  }

  async createDailyNote(dateStr: string) {
    await this.ensureDailyNote(dateStr);
    await this.refreshLeftSidebar();
    const file = this.app.vault.getAbstractFileByPath(dailyNotePath(dateStr));
    if (file instanceof TFile) {
      await this.openFile(file);
    }
  }

  async createRecurringMeeting(dateStr: string, name: string) {
    const folderPath = recurringFolderPath();

    // Ensure folder exists
    const folder = this.app.vault.getAbstractFileByPath(folderPath);
    if (!folder) {
      await this.app.vault.createFolder(folderPath);
    }

    const notePath = `${folderPath}/${name}.md`;
    const existing = this.app.vault.getAbstractFileByPath(notePath);
    if (existing instanceof TFile) {
      // Already exists — treat like opening an existing recurring meeting
      await this.openRecurringMeeting(existing, dateStr);
      await this.refreshLeftSidebar();
      return;
    }

    // Create new file with today's h1
    const date = fromDateStr(dateStr);
    const h1Text = formatH1Date(date);
    const file = await this.app.vault.create(notePath, `# ${h1Text}\n\n`);
    await this.refreshLeftSidebar();
    await this.openFile(file, 0);
  }

  private async ensureDailyNote(dateStr: string) {
    // Ensure Daily Notes folder exists
    const dnFolder = this.app.vault.getAbstractFileByPath(dailyNotesFolderPath());
    if (!dnFolder) {
      await this.app.vault.createFolder(dailyNotesFolderPath());
    }

    const notePath = dailyNotePath(dateStr);
    const file = this.app.vault.getAbstractFileByPath(notePath);
    if (!file) {
      await this.app.vault.create(notePath, "");
    }
  }

  private async refreshLeftSidebar() {
    const leftLeaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_LEFT_SIDEBAR);
    for (const leaf of leftLeaves) {
      const view = leaf.view as LeftSidebarView;
      await view.refreshPanels();
    }
  }

  private scheduleRefresh() {
    if (!this.isActive) return;
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    this.refreshTimer = setTimeout(() => {
      this.refreshTimer = null;
      this.doRefresh();
    }, 300);
  }

  private async doRefresh() {
    if (!this.isActive) return;

    const leftLeaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_LEFT_SIDEBAR);
    for (const leaf of leftLeaves) {
      const view = leaf.view as LeftSidebarView;
      await view.refreshPanels();
    }

    const rightLeaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_RIGHT_SIDEBAR);
    for (const leaf of rightLeaves) {
      const view = leaf.view as RightSidebarView;
      await view.refresh();
    }

    const fdfLeaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_FULL_DAY_FLOW);
    for (const leaf of fdfLeaves) {
      const view = leaf.view as FullDayFlowView;
      await view.setDate(view.getDateStr());
    }
  }
}

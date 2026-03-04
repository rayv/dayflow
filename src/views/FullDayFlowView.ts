import { ItemView, WorkspaceLeaf, TFile, TFolder, MarkdownRenderer } from "obsidian";
import { VIEW_TYPE_FULL_DAY_FLOW } from "../types";
import {
  formatDateHeader,
  fromDateStr,
  dailyNotePath,
  meetingsFolderPath,
  recurringFolderPath,
  formatH1Date,
  parseH1Date,
  isSameDay,
} from "../utils/dateUtils";

interface ContentSection {
  label: string;
  markdown: string;
  sourcePath: string;
  lineNumber: number;
}

export class FullDayFlowView extends ItemView {
  private dateStr: string;
  private openFileCallback: ((filePath: string, line?: number) => void) | null = null;

  constructor(leaf: WorkspaceLeaf, dateStr: string) {
    super(leaf);
    this.dateStr = dateStr;
  }

  setOpenFileCallback(cb: (filePath: string, line?: number) => void) {
    this.openFileCallback = cb;
  }

  getViewType(): string {
    return VIEW_TYPE_FULL_DAY_FLOW;
  }

  getDisplayText(): string {
    return `Full Day Flow \u2014 ${this.dateStr}`;
  }

  getIcon(): string {
    return "book-open";
  }

  getState() {
    return { ...super.getState(), dateStr: this.dateStr };
  }

  async setState(state: { dateStr?: string }, result: { history: boolean }) {
    if (state.dateStr) {
      this.dateStr = state.dateStr;
    }
    await super.setState(state, result);
    await this.render();
  }

  async onOpen() {
    await this.render();
  }

  async setDate(dateStr: string) {
    this.dateStr = dateStr;
    // updateHeader exists at runtime but isn't in the type definitions
    (this.leaf as any).updateHeader();
    await this.render();
  }

  private async render() {
    const container = this.containerEl.children[1] as HTMLElement;
    container.empty();
    container.addClass("rays-full-day-flow");

    const date = fromDateStr(this.dateStr);
    const header = container.createDiv({ cls: "rays-fdf-header" });
    header.createEl("h1", { text: formatDateHeader(date) });
    header.createDiv({ cls: "rays-fdf-subtitle", text: "Full Day Flow" });

    const sections = await this.gatherSections(date);

    if (sections.length === 0) {
      const empty = container.createDiv({ cls: "rays-fdf-empty" });
      empty.createDiv({ cls: "rays-fdf-empty-icon", text: "\uD83D\uDCC4" });
      empty.createDiv({ cls: "rays-fdf-empty-text", text: "No content for this day" });
      return;
    }

    for (const section of sections) {
      await this.renderSection(container, section);
    }
  }

  private async gatherSections(date: Date): Promise<ContentSection[]> {
    const sections: ContentSection[] = [];

    // 1. Daily note
    const dailyPath = dailyNotePath(this.dateStr);
    const dailyFile = this.app.vault.getAbstractFileByPath(dailyPath);
    if (dailyFile instanceof TFile) {
      const content = await this.app.vault.cachedRead(dailyFile);
      if (content.trim()) {
        sections.push({ label: "Daily Note", markdown: content, sourcePath: dailyPath, lineNumber: 0 });
      }
    }

    // 2. One-off meetings
    const meetingsPath = meetingsFolderPath(this.dateStr);
    const meetingsFolder = this.app.vault.getAbstractFileByPath(meetingsPath);
    if (meetingsFolder instanceof TFolder) {
      const meetingFiles = meetingsFolder.children
        .filter((f): f is TFile => f instanceof TFile && f.extension === "md")
        .sort((a, b) => a.basename.localeCompare(b.basename));

      for (const file of meetingFiles) {
        const content = await this.app.vault.cachedRead(file);
        if (content.trim()) {
          sections.push({ label: file.basename, markdown: content, sourcePath: file.path, lineNumber: 0 });
        }
      }
    }

    // 3. Recurring meetings — extract only this date's section
    const recurringPath = recurringFolderPath();
    const recurringFolder = this.app.vault.getAbstractFileByPath(recurringPath);
    if (recurringFolder instanceof TFolder) {
      const recurringFiles = recurringFolder.children
        .filter((f): f is TFile => f instanceof TFile && f.extension === "md")
        .sort((a, b) => a.basename.localeCompare(b.basename));

      for (const file of recurringFiles) {
        const content = await this.app.vault.cachedRead(file);
        const result = this.extractSectionForDate(content, date);
        if (result) {
          sections.push({
            label: `${file.basename} (Recurring)`,
            markdown: result.text,
            sourcePath: file.path,
            lineNumber: result.lineNumber,
          });
        }
      }
    }

    return sections;
  }

  private extractSectionForDate(content: string, date: Date): { text: string; lineNumber: number } | null {
    const lines = content.split("\n");
    let startIdx = -1;

    for (let i = 0; i < lines.length; i++) {
      const match = lines[i].match(/^#\s+(.+)$/);
      if (match) {
        const parsed = parseH1Date(match[1]);
        if (parsed && isSameDay(parsed, date)) {
          startIdx = i;
        } else if (startIdx !== -1) {
          return { text: lines.slice(startIdx, i).join("\n"), lineNumber: startIdx };
        }
      }
    }

    if (startIdx !== -1) return { text: lines.slice(startIdx).join("\n"), lineNumber: startIdx };
    return null;
  }

  private async renderSection(container: HTMLElement, section: ContentSection) {
    const divider = container.createDiv({ cls: "rays-fdf-divider" });
    const label = divider.createEl("a", { cls: "rays-fdf-divider-label", text: section.label });
    label.addEventListener("click", (e) => {
      e.preventDefault();
      if (this.openFileCallback) {
        this.openFileCallback(section.sourcePath, section.lineNumber);
      }
    });

    const contentEl = container.createDiv({ cls: "rays-fdf-content" });
    await MarkdownRenderer.render(
      this.app,
      section.markdown,
      contentEl,
      section.sourcePath,
      this,
    );
  }

  async onClose() {
    // cleanup handled by Component base class
  }
}

import { App, TFile } from "obsidian";
import { dailyNotePath } from "../utils/dateUtils";

export class DailyOutline {
  private containerEl: HTMLElement;
  private app: App;
  private onHeadingClick: (file: TFile, line: number) => void;
  private onCreateDaily: (dateStr: string) => void;

  constructor(
    parentEl: HTMLElement,
    app: App,
    onHeadingClick: (file: TFile, line: number) => void,
    onCreateDaily: (dateStr: string) => void,
  ) {
    this.containerEl = parentEl.createDiv({ cls: "rays-daily-outline" });
    this.app = app;
    this.onHeadingClick = onHeadingClick;
    this.onCreateDaily = onCreateDaily;
  }

  async update(dateStr: string) {
    this.containerEl.empty();

    const header = this.containerEl.createDiv({ cls: "rays-section-header" });
    header.createEl("h5", { text: "Daily Note" });

    const path = dailyNotePath(dateStr);
    const file = this.app.vault.getAbstractFileByPath(path);

    if (!(file instanceof TFile)) {
      const row = this.containerEl.createDiv({ cls: "rays-create-daily-row" });
      const btn = row.createEl("button", { cls: "rays-create-daily-btn", text: "Create daily note" });
      btn.addEventListener("click", () => {
        this.onCreateDaily(dateStr);
      });
      return;
    }

    const content = await this.app.vault.cachedRead(file);
    const lines = content.split("\n");
    const headings: { text: string; line: number }[] = [];

    for (let i = 0; i < lines.length; i++) {
      const match = lines[i].match(/^#\s+(.+)$/);
      if (match) {
        headings.push({ text: match[1].trim(), line: i });
      }
    }

    if (headings.length === 0) {
      const openLink = this.containerEl.createEl("a", {
        cls: "rays-heading-link rays-daily-open-link",
        text: file.basename,
      });
      openLink.addEventListener("click", (e) => {
        e.preventDefault();
        this.onHeadingClick(file as TFile, 0);
      });
      return;
    }

    const list = this.containerEl.createEl("ul", { cls: "rays-heading-list" });
    for (const h of headings) {
      const li = list.createEl("li", { cls: "rays-heading-item" });
      const link = li.createEl("a", { text: h.text, cls: "rays-heading-link" });
      link.addEventListener("click", (e) => {
        e.preventDefault();
        this.onHeadingClick(file as TFile, h.line);
      });
    }
  }

  destroy() {
    this.containerEl.remove();
  }
}

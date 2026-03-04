import { App, TFile, TFolder, Modal, TextComponent } from "obsidian";
import { meetingsFolderPath } from "../utils/dateUtils";

class NewMeetingModal extends Modal {
  private onSubmit: (name: string) => void;

  constructor(app: App, onSubmit: (name: string) => void) {
    super(app);
    this.onSubmit = onSubmit;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.createEl("h3", { text: "New Meeting Note" });

    const input = new TextComponent(contentEl);
    input.setPlaceholder("Person or meeting name");
    input.inputEl.addClass("rays-new-meeting-input");
    input.inputEl.style.width = "100%";
    input.inputEl.focus();

    input.inputEl.addEventListener("keydown", (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        const val = input.getValue().trim();
        if (val) {
          this.close();
          this.onSubmit(val);
        }
      }
    });

    const btn = contentEl.createEl("button", { text: "Create", cls: "mod-cta" });
    btn.style.marginTop = "12px";
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const val = input.getValue().trim();
      if (val) {
        this.close();
        this.onSubmit(val);
      }
    });
  }

  onClose() {
    this.contentEl.empty();
  }
}

export class MeetingsPanel {
  private containerEl: HTMLElement;
  private app: App;
  private currentDateStr: string = "";
  private onMeetingClick: (file: TFile) => void;
  private onCreateMeeting: (dateStr: string, name: string) => void;

  constructor(
    parentEl: HTMLElement,
    app: App,
    onMeetingClick: (file: TFile) => void,
    onCreateMeeting: (dateStr: string, name: string) => void,
  ) {
    this.containerEl = parentEl.createDiv({ cls: "rays-meetings-panel" });
    this.app = app;
    this.onMeetingClick = onMeetingClick;
    this.onCreateMeeting = onCreateMeeting;
  }

  async update(dateStr: string) {
    this.currentDateStr = dateStr;
    this.containerEl.empty();

    const header = this.containerEl.createDiv({ cls: "rays-section-header" });
    const headerRow = header.createDiv({ cls: "rays-section-header-row" });
    headerRow.createEl("h5", { text: "One-Off Meetings" });

    const addBtn = headerRow.createEl("button", { cls: "rays-add-btn", text: "+" });
    addBtn.setAttribute("aria-label", "New meeting note");
    addBtn.addEventListener("click", () => {
      new NewMeetingModal(this.app, (name) => {
        this.onCreateMeeting(this.currentDateStr, name);
      }).open();
    });

    const folderPath = meetingsFolderPath(dateStr);
    const folder = this.app.vault.getAbstractFileByPath(folderPath);

    if (!(folder instanceof TFolder)) {
      this.containerEl.createDiv({
        cls: "rays-empty-message",
        text: "No meetings for this date",
      });
      return;
    }

    const meetingFiles = folder.children.filter(
      (f): f is TFile => f instanceof TFile && f.extension === "md"
    );

    if (meetingFiles.length === 0) {
      this.containerEl.createDiv({
        cls: "rays-empty-message",
        text: "No meetings scheduled",
      });
      return;
    }

    const list = this.containerEl.createEl("ul", { cls: "rays-meeting-list" });
    for (const file of meetingFiles) {
      const name = file.basename;
      const li = list.createEl("li", { cls: "rays-meeting-item" });
      const link = li.createEl("a", { text: name, cls: "rays-meeting-link" });
      link.addEventListener("click", (e) => {
        e.preventDefault();
        this.onMeetingClick(file);
      });
    }
  }

  destroy() {
    this.containerEl.remove();
  }
}

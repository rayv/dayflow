import { App, TFile, TFolder, Modal, DropdownComponent, TextComponent } from "obsidian";
import { recurringFolderPath, parseH1Date, isSameDay, fromDateStr } from "../utils/dateUtils";

class AddRecurringModal extends Modal {
  private existingFiles: TFile[];
  private onSelectExisting: (file: TFile) => void;
  private onCreateNew: (name: string) => void;

  constructor(
    app: App,
    existingFiles: TFile[],
    onSelectExisting: (file: TFile) => void,
    onCreateNew: (name: string) => void,
  ) {
    super(app);
    this.existingFiles = existingFiles;
    this.onSelectExisting = onSelectExisting;
    this.onCreateNew = onCreateNew;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.createEl("h3", { text: "Add Recurring Meeting" });

    let selectedFile: TFile | null = null;

    // Dropdown of existing recurring meetings
    if (this.existingFiles.length > 0) {
      const dropdownRow = contentEl.createDiv({ cls: "rays-modal-row" });
      dropdownRow.createEl("label", { text: "Existing meeting:", cls: "rays-modal-label" });

      const dropdown = new DropdownComponent(dropdownRow);
      dropdown.addOption("", "— Select —");
      for (const f of this.existingFiles) {
        dropdown.addOption(f.path, f.basename);
      }
      dropdown.onChange((val) => {
        selectedFile = this.existingFiles.find((f) => f.path === val) || null;
      });

      const addExistingBtn = contentEl.createEl("button", { text: "Add entry for today", cls: "mod-cta" });
      addExistingBtn.style.marginTop = "8px";
      addExistingBtn.style.width = "100%";
      addExistingBtn.addEventListener("click", () => {
        if (selectedFile) {
          this.onSelectExisting(selectedFile);
          this.close();
        }
      });

      contentEl.createEl("hr", { cls: "rays-modal-divider" });
    }

    // Create new
    const newRow = contentEl.createDiv({ cls: "rays-modal-row" });
    newRow.createEl("label", { text: "Or create new:", cls: "rays-modal-label" });

    const input = new TextComponent(newRow);
    input.setPlaceholder("Person, group, or topic");
    input.inputEl.style.width = "100%";

    input.inputEl.addEventListener("keydown", (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        const val = input.getValue().trim();
        if (val) {
          this.onCreateNew(val);
          this.close();
        }
      }
    });

    const createBtn = contentEl.createEl("button", { text: "Create", cls: "mod-cta" });
    createBtn.style.marginTop = "8px";
    createBtn.style.width = "100%";
    createBtn.addEventListener("click", () => {
      const val = input.getValue().trim();
      if (val) {
        this.onCreateNew(val);
        this.close();
      }
    });
  }

  onClose() {
    this.contentEl.empty();
  }
}

interface RecurringMeeting {
  file: TFile;
  name: string;
  hasEntryForDate: boolean;
}

export class RecurringPanel {
  private containerEl: HTMLElement;
  private app: App;
  private currentDateStr: string = "";
  private onRecurringClick: (file: TFile, dateStr: string) => void;
  private onCreateRecurring: (dateStr: string, name: string) => void;

  constructor(
    parentEl: HTMLElement,
    app: App,
    onRecurringClick: (file: TFile, dateStr: string) => void,
    onCreateRecurring: (dateStr: string, name: string) => void,
  ) {
    this.containerEl = parentEl.createDiv({ cls: "rays-recurring-panel" });
    this.app = app;
    this.onRecurringClick = onRecurringClick;
    this.onCreateRecurring = onCreateRecurring;
  }

  async update(dateStr: string) {
    this.currentDateStr = dateStr;
    this.containerEl.empty();

    const header = this.containerEl.createDiv({ cls: "rays-section-header" });
    const headerRow = header.createDiv({ cls: "rays-section-header-row" });
    headerRow.createEl("h5", { text: "Recurring" });

    // Add button
    const addBtn = headerRow.createEl("button", { cls: "rays-add-btn", text: "+" });
    addBtn.setAttribute("aria-label", "Add recurring meeting");
    addBtn.addEventListener("click", () => {
      const allFiles = this.getAllRecurringFiles();
      new AddRecurringModal(
        this.app,
        allFiles,
        (file) => this.onRecurringClick(file, this.currentDateStr),
        (name) => this.onCreateRecurring(this.currentDateStr, name),
      ).open();
    });

    const folderPath = recurringFolderPath();
    const folder = this.app.vault.getAbstractFileByPath(folderPath);

    if (!(folder instanceof TFolder)) {
      this.containerEl.createDiv({
        cls: "rays-empty-message",
        text: "No recurring meetings for this date",
      });
      return;
    }

    const selectedDate = fromDateStr(dateStr);
    const meetings: RecurringMeeting[] = [];

    for (const child of folder.children) {
      if (!(child instanceof TFile) || child.extension !== "md") continue;

      const content = await this.app.vault.cachedRead(child);
      const hasEntry = this.hasH1ForDate(content, selectedDate);

      if (hasEntry) {
        meetings.push({
          file: child,
          name: child.basename,
          hasEntryForDate: true,
        });
      }
    }

    if (meetings.length === 0) {
      this.containerEl.createDiv({
        cls: "rays-empty-message",
        text: "No recurring meetings for this date",
      });
      return;
    }

    const list = this.containerEl.createEl("ul", { cls: "rays-recurring-list" });
    for (const m of meetings) {
      const li = list.createEl("li", { cls: "rays-recurring-item has-entry" });
      const link = li.createEl("a", { text: m.name, cls: "rays-recurring-link" });
      link.addEventListener("click", (e) => {
        e.preventDefault();
        this.onRecurringClick(m.file, dateStr);
      });
    }
  }

  private getAllRecurringFiles(): TFile[] {
    const folder = this.app.vault.getAbstractFileByPath(recurringFolderPath());
    if (!(folder instanceof TFolder)) return [];
    return folder.children.filter(
      (f): f is TFile => f instanceof TFile && f.extension === "md"
    );
  }

  private hasH1ForDate(content: string, date: Date): boolean {
    const lines = content.split("\n");
    for (const line of lines) {
      const match = line.match(/^#\s+(.+)$/);
      if (match) {
        const parsed = parseH1Date(match[1]);
        if (parsed && isSameDay(parsed, date)) return true;
      }
    }
    return false;
  }

  destroy() {
    this.containerEl.remove();
  }
}

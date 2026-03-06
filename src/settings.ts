import { App, PluginSettingTab, Setting } from "obsidian";

export interface DayFlowSettings {
  defaultCalendarView: "week" | "month";
  showWeekends: boolean;
}

export const DEFAULT_SETTINGS: DayFlowSettings = {
  defaultCalendarView: "month",
  showWeekends: false,
};

// Duck-typed to avoid a circular import with main.ts
interface SettingsHost {
  settings: DayFlowSettings;
  saveSettings(): Promise<void>;
  applyShowWeekends(value: boolean): void;
  reloadDayFlow(): Promise<void>;
}

export class DayFlowSettingTab extends PluginSettingTab {
  private plugin: SettingsHost;

  constructor(app: App, plugin: SettingsHost) {
    // PluginSettingTab expects a Plugin instance; cast to satisfy the base class
    super(app, plugin as any);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName("Default calendar view")
      .setDesc("Which calendar panel to show in the left sidebar.")
      .addDropdown((d) =>
        d
          .addOption("month", "Month")
          .addOption("week", "Week strip")
          .setValue(this.plugin.settings.defaultCalendarView)
          .onChange(async (value) => {
            this.plugin.settings.defaultCalendarView = value as "week" | "month";
            await this.plugin.saveSettings();
            await this.plugin.reloadDayFlow();
          })
      );

    new Setting(containerEl)
      .setName("Show weekends")
      .setDesc("Include Saturday and Sunday in calendar and week strip views.")
      .addToggle((t) =>
        t
          .setValue(this.plugin.settings.showWeekends)
          .onChange(async (value) => {
            this.plugin.settings.showWeekends = value;
            await this.plugin.saveSettings();
            this.plugin.applyShowWeekends(value);
          })
      );
  }
}

import * as vscode from "vscode";

type LogLevel = "info" | "debug" | "off";

const OUTPUT_CHANNEL_NAME = "Package Watcher";
const LOG_LEVEL_SETTING = "logLevel";
const SETTINGS_NAMESPACE = "packageWatcher";

class Log {
  private _outputChannel: vscode.OutputChannel;
  private _logLevel!: LogLevel;
  private _showOutputOnError!: boolean;
  private _disposable: vscode.Disposable;

  constructor() {
    this._outputChannel =
      vscode.window.createOutputChannel(OUTPUT_CHANNEL_NAME);
    this._disposable = vscode.workspace.onDidChangeConfiguration(() => {
      this.updateConfiguration();
    });
    this.updateConfiguration();
  }

  private _appendLine(message: string, tag: "Info" | "Error" | "Debug") {
    if (this._logLevel === "off") {
      return;
    }

    const timeStamp =
      this._logLevel === "debug" ? ` ${new Date().getTime() / 1000}s` : "";

    // Colors: https://git.io/JYsim
    this._outputChannel.appendLine(`[${tag}${timeStamp}] ${message}`);
  }

  public show() {
    this._outputChannel?.show();
  }

  public info(message: string) {
    this._appendLine(message, "Info");
  }

  public error(message: string) {
    this._appendLine(message, "Error");
    if (this._showOutputOnError) {
      this.show();
    }
  }

  public debug(message: string) {
    if (this._logLevel === "debug") {
      this._appendLine(message, "Debug");
    }
  }

  public dispose() {
    if (this._disposable) {
      this._disposable.dispose();
    }
  }

  private updateConfiguration() {
    const configuration = vscode.workspace.getConfiguration(SETTINGS_NAMESPACE);

    this._logLevel = configuration.get(LOG_LEVEL_SETTING) ?? "info";
    this._showOutputOnError = !!configuration.get("showOutputOnError");
  }
}

const logger = new Log();
export default logger;

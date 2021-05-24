import * as vscode from "vscode";
import { URL, URLSearchParams } from "url";
import { v5 as uuid } from "uuid";
import git from "./git";
import got from "got";
import log from "./log";
import packageJSON from "./packageJSON";

const GA_TRACKING_ID = "UA-190225-25";
const uuidNamespace = "12fcef73-9beb-4821-a0db-208e6fbc2132"; // Generated with https://www.uuidgenerator.net/

class Log {
  private _enableTelemetry!: boolean;
  private _disposable: vscode.Disposable;

  constructor() {
    this._disposable = vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration("packageWatcher")) {
        this.getEnableTelemetry();
      }
    });

    this.getEnableTelemetry();
  }

  private getEnableTelemetry() {
    this._enableTelemetry = !!vscode.workspace
      .getConfiguration("packageWatcher")
      .get("enableTelemetry");
  }

  public dispose() {
    if (this._disposable) {
      this._disposable.dispose();
    }
  }

  public async event({
    category,
    action,
    label,
    value,
  }: {
    category: "Event" | "Error";
    action: "Activate" | "Count" | "Individual" | "Error";
    label: string;
    value?: string;
  }): Promise<void> {
    // Only track usage when the user enables telemetry for this extension
    if (!this._enableTelemetry) {
      return;
    }

    const userId = process.env.USER || "_unknown";
    const [gitUserEmail, gitRemote] = await Promise.all([
      git.userEmail(),
      git.remote(),
    ]);

    // List of all google analytics parameters: https://developers.google.com/analytics/devguides/collection/protocol/v1/parameters
    const data = {
      // API Version.
      v: "1",
      // Tracking ID / Property ID.
      tid: GA_TRACKING_ID,
      // Anonymous Client Identifier. Ideally, this should be a UUID that
      // is associated with particular user, device, or browser instance.
      cid: uuid(userId, uuidNamespace),
      // Event hit type.
      t: "event",
      // Event category.
      ec: category,
      // Event action.
      ea: action,
      // Event label.
      el: label,
      // Event value.
      ...(value ? { ev: value } : {}),
      // Custom dimension: User ID
      cd1: userId,
      // Custom dimension: Extension Version
      cd2: packageJSON.get()?.version || "_unknown",
      // Custom dimention: Git User Email
      cd3: gitUserEmail,
      // Custom dimention: Git Remote URL
      cd4: gitRemote,
    };

    const searchParams = new URLSearchParams();
    for (const [key, value] of Object.entries(data)) {
      searchParams.append(key, String(value));
    }

    const url = new URL("http://www.google-analytics.com/collect");
    url.search = searchParams.toString();

    try {
      got.post(url.toString());
    } catch (e) {
      console.error(e);
      log.info(`Error trying to track: ${e.message}`);
    }
  }
}

const tracker = new Log();
export default tracker;

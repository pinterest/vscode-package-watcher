import * as vscode from "vscode";
import execa from "execa";
import log from "./log";
import path from "path";
import statusBar from "./statusBar";
import track from "./track";

type ExcludesFalse = <T>(x: T | false) => x is T;

const lockFiles = ["yarn.lock", "package-lock.json"];
const lockFileGlobPattern = `**/{${lockFiles.join(",")}}`;

async function runCommand(
  command: string,
  options: execa.CommonOptions<"utf8">
): Promise<execa.ExecaChildProcess> {
  try {
    const wrappedCommand = `export NVM_DIR="$HOME/.nvm"; [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh" ; nvm use > /dev/null 2>&1; ${command}`;
    log.info(`Command: ${command} / Options: ${JSON.stringify(options)}`);
    return await execa.command(wrappedCommand, { shell: "bash", ...options });
  } catch (e) {
    return e;
  }
}

class PackageWatcherExtension {
  private _context: vscode.ExtensionContext;
  private _lockfilesWithNodeModules: vscode.Uri[];

  constructor({
    context,
    lockfilesWithNodeModules,
  }: {
    context: vscode.ExtensionContext;
    lockfilesWithNodeModules: vscode.Uri[];
  }) {
    this._context = context;
    this._lockfilesWithNodeModules = lockfilesWithNodeModules;

    this.resetStatusBar();
  }

  public resetStatusBar(): void {
    statusBar.update({
      icon: "check-all",
      tooltip: `Watching ${
        this._lockfilesWithNodeModules.length
      } package lock ${
        this._lockfilesWithNodeModules.length === 1 ? "file" : "files"
      }`,
    });
  }

  public async eventHandler({
    documentUri,
  }: {
    documentUri: vscode.Uri;
  }): Promise<void> {
    const filteredPackageLockFiles = this._lockfilesWithNodeModules.filter(
      (uri) => documentUri.toString() === uri.toString()
    );

    if (filteredPackageLockFiles.length === 0) {
      log.info(
        "No package lock files with a adjacent node_modules were modified"
      );
      return;
    }

    const mode: "request" | "auto" =
      vscode.workspace.getConfiguration("packageWatcher").get("mode") ?? "auto";

    await Promise.all(
      filteredPackageLockFiles.map(async (filteredPackageLockFile) => {
        const terminalCommand = filteredPackageLockFile.fsPath.endsWith(
          "yarn.lock"
        )
          ? "yarn install"
          : "npm install";

        const command =
          mode === "request"
            ? await vscode.window.showWarningMessage(
                `${vscode.workspace.asRelativePath(
                  filteredPackageLockFile
                )} was modified.`,
                terminalCommand
              )
            : await (async () => {
                // Wait a few seconds before running the install command
                await new Promise((r) => setTimeout(r, 4000));
                return terminalCommand;
              })();
        if (!command) {
          return;
        }

        const directory = path.dirname(filteredPackageLockFile.fsPath);
        const directoryUri = vscode.Uri.parse(directory);
        const relativeDirectory = vscode.workspace.asRelativePath(directoryUri);

        statusBar.update({
          icon: "loading",
          tooltip: `Running ${command} in ${relativeDirectory}`,
        });

        const output = await runCommand(command, {
          cwd: directory,
        });
        log.debug(`Command output: ${JSON.stringify(output, null, 2)}`);

        const { exitCode, stdout, stderr } = output;
        const lines = stdout
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean)
          // Output from `yarn`
          .filter((line) => !line.startsWith("Done in"));

        if (exitCode === 0) {
          lines.forEach((line) => {
            log.info(`[Command Output] ${line}`);
          });

          this.resetStatusBar();

          track.event({
            category: "Event",
            action: "Count",
            label: "Pass",
            value: "1",
          });

          if (mode === "request") {
            vscode.window.showInformationMessage(
              `${command} in ${relativeDirectory} succeeded`
            );
          }
        } else {
          log.debug(`[Command Exit Code] ${exitCode}`);
          [
            ...lines,
            ...stderr
              .split("\n")
              .map((line) => line.trim())
              .filter(Boolean),
          ].forEach((line) => {
            log.error(`${line}`);
          });

          statusBar.update({
            icon: "error",
            tooltip: `Error: ${lines}`,
          });

          track.event({
            category: "Event",
            action: "Count",
            label: "Fail",
            value: "1",
          });

          const showLogs = await vscode.window.showErrorMessage(
            `${command} in ${relativeDirectory} failed`,
            "Show logs"
          );

          if (showLogs === "Show logs") {
            log.show();
          }
        }
      })
    );
  }
}

async function doesNodeModulesExist(uri: vscode.Uri) {
  try {
    await vscode.workspace.fs.stat(
      uri.with({
        path:
          lockFiles.reduce(
            (acc, currentValue) => acc.replace(currentValue, ""),
            uri.path
          ) + "node_modules",
      })
    );
    return true;
  } catch (error) {
    return false;
  }
}

async function initializePackageWatcher(
  context: vscode.ExtensionContext
): Promise<PackageWatcherExtension> {
  statusBar.update({
    icon: "loading",
    tooltip: "Initializing",
  });

  const lockFiles = await vscode.workspace.findFiles(
    lockFileGlobPattern,
    "**/node_modules/"
  );

  const lockfilesWithNodeModules = (
    await Promise.all(
      lockFiles.map(async (uri) =>
        (await doesNodeModulesExist(uri)) ? uri : false
      )
    )
  ).filter(Boolean as any as ExcludesFalse);

  log.info(
    `Found ${lockfilesWithNodeModules.length} package lock ${
      lockfilesWithNodeModules.length === 1 ? "file" : "files"
    } with 'node_modules' installed`
  );

  lockfilesWithNodeModules.forEach((lockfileWithNodeModules) => {
    log.info(`File: ${lockfileWithNodeModules.fsPath}`);
  });

  track.event({
    category: "Event",
    action: "Activate",
    label: "Extension",
  });

  return new PackageWatcherExtension({
    context,
    lockfilesWithNodeModules,
  });
}

export async function activate(context: vscode.ExtensionContext) {
  statusBar.activate();
  let extension: PackageWatcherExtension = await initializePackageWatcher(
    context
  );

  vscode.workspace.onDidChangeConfiguration(async (event) => {
    if (event.affectsConfiguration("packageWatcher")) {
      extension = await initializePackageWatcher(context);
      log.info("[Config reloaded]");
    }
  });

  const watchers = [
    vscode.workspace.createFileSystemWatcher(lockFileGlobPattern),
  ];

  const eventHandler = (documentUri: vscode.Uri) => {
    extension.eventHandler({ documentUri });
  };

  watchers.forEach((watcher) => {
    watcher.onDidChange(eventHandler);
    watcher.onDidCreate(eventHandler);
    watcher.onDidDelete(eventHandler);
  });

  context.subscriptions.push(
    vscode.commands.registerCommand("packageWatcher.showOutputChannel", () => {
      log.show();
    }),
    statusBar,
    ...watchers
  );
}

export function deactivate() {}

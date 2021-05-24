import * as vscode from "vscode";

let statusBarItem: vscode.StatusBarItem;

const activate = () => {
  statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right
  );
  statusBarItem.show();
  statusBarItem.command = "packageWatcher.showOutputChannel";
};

const update = ({
  icon,
  tooltip,
}: {
  icon: "loading" | "check-all" | "error";
  tooltip: string;
}) => {
  statusBarItem.text = `$(${icon}) Package Watcher`;
  statusBarItem.tooltip = tooltip;
};

const dispose = () => {
  statusBarItem.hide();
  statusBarItem.dispose();
};

const get = () => {
  return statusBarItem;
};

export default { activate, dispose, get, update };

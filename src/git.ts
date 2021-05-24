import * as vscode from "vscode";
import execa from "execa";
import log from "./log";
import os from "os";

/**
 * Get the git email of the current user
 */
const userEmail = async (): Promise<string> => {
  const unknown = "_unknown@test.com";
  try {
    const result = await execa.command("git config user.email");
    console.log(result?.stdout);

    return result?.stdout ?? unknown;
  } catch (e) {
    console.error(e);
    log.info(`Git user.email Error: ${e.message}`);
    return unknown;
  }
};

/**
 * Get the git remote
 */
const remote = async (): Promise<string> => {
  const unknown = "_unknown";
  try {
    const { workspaceFolders } = vscode.workspace;

    if (!workspaceFolders?.length) {
      return unknown;
    }

    const result = await execa.command(
      `cd ${workspaceFolders[0].uri.fsPath} && git config remote.origin.url`,
      {
        shell: os.platform() !== "win32" ? "bash" : false,
      }
    );
    console.log(result?.stdout);

    return result?.stdout ?? unknown;
  } catch (e) {
    console.error(e);
    log.info(`Git remote.origin.url Error: ${e.message}`);
    return unknown;
  }
};

export default {
  userEmail,
  remote,
};

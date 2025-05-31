import {
  Manifest,
  PluginNotificationData,
  PluginResponseData,
  PluginRequestData,
} from "../types";
import PluginStoreService from "./PluginStoreService";
import rawLog from "@bksLogger";
import _ from "lodash";

function joinUrlPath(a: string, b: string): string {
  return `${a.replace(/\/+$/, "")}/${b.replace(/^\/+/, "")}`;
}

const log = rawLog.scope("WebPluginManager");

export default class WebPluginLoader {
  private iframe?: HTMLIFrameElement;

  constructor(
    public readonly manifest: Manifest,
    private pluginStore: PluginStoreService
  ) {
    this.handleMessage = this.handleMessage.bind(this);
  }

  /** Starts the plugin */
  async load() {
    // Add event listener for messages from iframe
    window.addEventListener("message", this.handleMessage);

    this.manifest.capabilities.views?.sidebars?.forEach((sidebar) => {
      this.pluginStore.addSidebarTab({
        id: sidebar.id,
        label: sidebar.name,
        url: `plugin://${this.manifest.id}/${this.getEntry(sidebar.entry)}`,
      });
    });
  }

  private handleMessage(event: MessageEvent) {
    if (!this.iframe) return;

    // Check if the message is from our iframe
    if (event.source === this.iframe.contentWindow) {
      this.handleViewRequest({
        id: event.data.id,
        name: event.data.name,
        args: event.data.args[0],
      });
    }
  }

  private async handleViewRequest(request: PluginRequestData) {
    this.checkPermission(request);

    const response: PluginResponseData = {
      id: request.id,
      result: {},
    };

    try {
      switch (request.name) {
        // ========= READ ACTIONS ===========
        case "getTheme":
          response.result = this.pluginStore.getTheme();
          break;
        case "getTables":
          response.result = this.pluginStore.getTables();
          break;
        case "getColumns":
          response.result = await this.pluginStore.getColumns(
            request.args.table
          );
          break;
        case "getConnectionInfo":
          response.result = this.pluginStore.getConnectionInfo();
          break;
        case "getActiveTab":
          response.result = this.pluginStore.getActiveTab();
          break;
        case "getAllTabs":
          response.result = this.pluginStore.getAllTabs();
          break;

        // ======== WRITE ACTIONS ===========
        case "createQueryTab": // FIXME not stable yet
          response.result = await this.pluginStore.createQueryTab(
            request.args.query,
            request.args.title
          );
          break;
        case "updateQueryText":
          response.result = this.pluginStore.updateQueryText(
            request.args.tabId,
            request.args.query
          );
          break;
        case "runQuery":
          response.result = await this.pluginStore.runQuery(request.args.query);
          break;
        case "runQueryTab":
          throw new Error("Not implemented."); // FIXME
        case "runQueryTabPartially":
          throw new Error("Not implemented."); // FIXME
        case "insertSuggestion":
          // TODO this will add suggestion to the query tab like copilot or cursor
          throw new Error("Not implemented."); // FIXME

        default:
          throw new Error(`Unknown request: ${request.name}`);
      }
    } catch (e) {
      response.error = e;
    }

    this.iframe.contentWindow.postMessage(response, "*");
  }

  async registerIframe(iframe: HTMLIFrameElement) {
    this.iframe = iframe;
  }

  postMessage(data: PluginNotificationData | PluginResponseData) {
    if (!this.iframe) {
      log.warn("Cannot post message, iframe not registered.");
      return;
    }
    this.iframe.contentWindow.postMessage(data, "*");
  }

  getEntry(entry: string) {
    if (!this.manifest.pluginEntryDir) {
      return entry;
    }
    return joinUrlPath(this.manifest.pluginEntryDir, entry);
  }

  async unload() {
    window.removeEventListener("message", this.handleMessage);

    this.manifest.capabilities.views?.sidebars.forEach((sidebar) => {
      this.pluginStore.removeSidebarTab(sidebar.id);
    });
  }

  checkPermission(data: PluginRequestData) {
    // do nothing on purpose
    // if not permitted, throw error
  }
}

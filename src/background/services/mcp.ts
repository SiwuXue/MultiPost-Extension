import { type SyncData, type SyncDataPlatform, createTabsForPlatforms, getPlatformInfos } from "~sync/common";
import { addTabsManagerMessages, getTabsManagerMessages } from "./tabs";

type McpRequest = {
  type?: string;
  method?: string;
  params?: unknown;
};

type McpResponse = {
  ok: boolean;
  error?: string;
  version?: string;
  platforms?: string[];
  platformInfos?: unknown[];
  tabs?: Array<{ platform: string; tabId?: number; status?: string }>;
};

const isMcpRequest = (request: McpRequest) => {
  if (!request) return false;
  if (request.type === "MULTIPOST_MCP") return true;
  return typeof request.method === "string" && request.method.startsWith("multipost.");
};

const sanitizePlatformInfo = (platform) => {
  const platformCopy = { ...platform };
  platformCopy.injectFunction = undefined;
  if (platformCopy.accountInfo) {
    platformCopy.accountInfo.extraData = undefined;
  }
  return platformCopy;
};

const getPlatformsPayload = async () => {
  const platformInfos = await getPlatformInfos();
  const sanitized = platformInfos.map(sanitizePlatformInfo);
  return {
    platformInfos: sanitized,
    platforms: sanitized.map((platform) => platform.name),
  };
};

const handlePing = async (params: { withPlatforms?: boolean } | undefined): Promise<McpResponse> => {
  if (params?.withPlatforms) {
    const { platforms, platformInfos } = await getPlatformsPayload();
    return {
      ok: true,
      version: chrome.runtime.getManifest().version,
      platforms,
      platformInfos,
    };
  }

  return {
    ok: true,
    version: chrome.runtime.getManifest().version,
  };
};

const handlePlatforms = async (): Promise<McpResponse> => {
  const { platformInfos } = await getPlatformsPayload();
  return {
    ok: true,
    platformInfos,
  };
};

const handlePublish = async (params: SyncData): Promise<McpResponse> => {
  if (!params || !Array.isArray(params.platforms) || params.platforms.length === 0) {
    return { ok: false, error: "No platforms provided" };
  }

  const tabs = await createTabsForPlatforms(params);
  addTabsManagerMessages({
    syncData: params,
    tabs: tabs.map((t: { tab: chrome.tabs.Tab; platformInfo: SyncDataPlatform }) => ({
      tab: t.tab,
      platformInfo: t.platformInfo,
    })),
  });

  return {
    ok: true,
    tabs: tabs.map((t: { tab: chrome.tabs.Tab; platformInfo: SyncDataPlatform }) => ({
      platform: t.platformInfo.name,
      tabId: t.tab.id,
    })),
  };
};

const handleStatus = async (): Promise<McpResponse> => {
  const groups = getTabsManagerMessages();
  const entries = groups.flatMap((group) =>
    group.tabs.map((item) => ({
      platform: item.platformInfo.name,
      tabId: item.tab.id,
    })),
  );

  const statuses = await Promise.all(
    entries.map(async (entry) => {
      if (!entry.tabId) {
        return { ...entry, status: "unknown" };
      }
      try {
        await chrome.tabs.get(entry.tabId);
        return { ...entry, status: "open" };
      } catch {
        return { ...entry, status: "closed" };
      }
    }),
  );

  return {
    ok: true,
    tabs: statuses.map((item) => ({
      platform: item.platform,
      tabId: item.tabId,
      status: item.status,
    })),
  } as McpResponse;
};

export const mcpMessageHandler = (request: McpRequest, _sender, sendResponse) => {
  if (!isMcpRequest(request)) return;

  const { method, params } = request;
  (async () => {
    switch (method) {
      case "multipost.ping":
        sendResponse(await handlePing(params as { withPlatforms?: boolean }));
        break;
      case "multipost.platforms":
        sendResponse(await handlePlatforms());
        break;
      case "multipost.publish":
        sendResponse(await handlePublish(params as SyncData));
        break;
      case "multipost.status":
        sendResponse(await handleStatus());
        break;
      default:
        sendResponse({ ok: false, error: "Unknown method" } as McpResponse);
    }
  })();
};

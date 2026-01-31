# MCP (Browser-side) Integration Plan

This document proposes a minimal, browser-side MCP integration for MultiPost. It focuses on a simple request/response API and a compact schema for platforms and publish payloads, then provides a minimal extension-to-MCP example.

## 1) API shape (browser-side MCP)

### 1.1 Core methods

> **Transport**: JSON over `chrome.runtime.sendMessage` (extension host) or a local HTTP bridge hosted by the extension.

1) `multipost.ping`
- Purpose: health check and optional platform list.
- Request:
  ```json
  {
    "method": "multipost.ping",
    "params": {
      "withPlatforms": true
    }
  }
  ```
- Response:
  ```json
  {
    "ok": true,
    "version": "<extension-version>",
    "platforms": ["ARTICLE_ZHIHU", "VIDEO_YOUTUBE", "DYNAMIC_X", "PODCAST_QQMUSIC"]
  }
  ```

2) `multipost.platforms`
- Purpose: fetch full platform metadata (for UI or validation).
- Request:
  ```json
  { "method": "multipost.platforms" }
  ```
- Response:
  ```json
  {
    "ok": true,
    "platformInfos": [
      {
        "name": "ARTICLE_ZHIHU",
        "type": "ARTICLE",
        "platformName": "知乎",
        "homeUrl": "https://zhuanlan.zhihu.com/write",
        "injectUrl": "https://zhuanlan.zhihu.com/write",
        "tags": ["CN"],
        "accountKey": "zhihu"
      }
    ]
  }
  ```

3) `multipost.publish`
- Purpose: publish content to one or more platforms.
- Request:
  ```json
  {
    "method": "multipost.publish",
    "params": {
      "isAutoPublish": true,
      "platforms": [
        { "name": "ARTICLE_ZHIHU" },
        { "name": "ARTICLE_JUEJIN" }
      ],
      "data": {
        "title": "Hello",
        "digest": "Short summary",
        "cover": { "name": "cover.png", "url": "blob:..." },
        "htmlContent": "<p>Hello</p>",
        "markdownContent": "Hello"
      }
    }
  }
  ```
- Response:
  ```json
  {
    "ok": true,
    "tabs": [
      {
        "platform": "ARTICLE_ZHIHU",
        "tabId": 123
      }
    ]
  }
  ```

4) `multipost.status`
- Purpose: get publish status for open tabs (best-effort).
- Request:
  ```json
  { "method": "multipost.status" }
  ```
- Response:
  ```json
  { "ok": true, "tabs": [{ "platform": "ARTICLE_ZHIHU", "status": "open" }] }
  ```

## 2) Platform schema (compact)

```ts
export interface McpPlatformInfo {
  name: string; // e.g. ARTICLE_ZHIHU
  type: "DYNAMIC" | "VIDEO" | "ARTICLE" | "PODCAST";
  platformName: string;
  homeUrl: string;
  injectUrl: string;
  tags?: string[];
  accountKey: string;
}
```

## 3) Publish payload schema (typed)

```ts
export interface McpFileData {
  name: string;
  url: string; // blob:, data:, or https://
  type?: string;
  size?: number;
}

export interface McpPublishPlatform {
  name: string; // one of platform keys
  injectUrl?: string;
  extraConfig?: { customInjectUrls?: string[] } | unknown;
}

export interface McpPublishPayload {
  isAutoPublish: boolean;
  platforms: McpPublishPlatform[];
  data: McpDynamicData | McpArticleData | McpVideoData | McpPodcastData;
}

export interface McpDynamicData {
  title: string;
  content: string;
  images: McpFileData[];
  videos: McpFileData[];
}

export interface McpArticleData {
  title: string;
  digest: string;
  cover: McpFileData;
  htmlContent: string;
  markdownContent: string;
  images?: McpFileData[];
}

export interface McpVideoData {
  title: string;
  content: string;
  video: McpFileData;
  tags?: string[];
  cover?: McpFileData;
  verticalCover?: McpFileData;
  scheduledPublishTime?: number;
}

export interface McpPodcastData {
  title: string;
  description: string;
  audio: McpFileData;
}
```

## 4) Minimal extension-to-MCP bridge (browser)

> This example assumes a background script that proxies MCP calls to existing MultiPost APIs.

```ts
// background/mcp-bridge.ts (example only)
chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  const { method, params } = request || {};

  if (method === "multipost.ping") {
    // reuse existing ping if present
    return sendResponse({ ok: true, version: chrome.runtime.getManifest().version });
  }

  if (method === "multipost.platforms") {
    chrome.runtime.sendMessage({ action: "MULTIPOST_EXTENSION_PLATFORMS" }, (resp) => {
      sendResponse({ ok: true, platformInfos: resp?.platforms || [] });
    });
    return true;
  }

  if (method === "multipost.publish") {
    chrome.runtime.sendMessage({ action: "MULTIPOST_EXTENSION_SYNC", data: params }, (resp) => {
      sendResponse({ ok: true, tabs: resp?.tabs || [] });
    });
    return true;
  }

  sendResponse({ ok: false, error: "Unknown method" });
});
```

## 5) Suggested next steps

1. Add a small MCP client wrapper in the host app to call the above methods.
2. Keep the payload aligned with MultiPost `SyncData` and `PlatformInfo` definitions.
3. Provide a platform list endpoint to let MCP clients render a picker.

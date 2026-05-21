self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let data = {};

  if (event.data) {
    try {
      data = event.data.json();
    } catch {
      data = { body: event.data.text() };
    }
  }

  const title = data.title || "Rutin";
  const url = data.url || "/inbox";

  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "新着通知があります",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag: data.tag || "rutin-notification",
      data: { url },
    })
  );
});

function urlsMatch(clientUrl, targetUrl) {
  try {
    const client = new URL(clientUrl);
    const target = new URL(targetUrl);

    return client.origin === target.origin && client.pathname === target.pathname;
  } catch {
    return clientUrl === targetUrl;
  }
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const rawUrl = event.notification.data && event.notification.data.url ? event.notification.data.url : "/inbox";
  const targetUrl = new URL(rawUrl, self.location.origin).href;

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client && urlsMatch(client.url, targetUrl)) {
          return client.focus();
        }
      }

      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }

      return undefined;
    })
  );
});

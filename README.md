# GoDoxy WebUI

This is the frontend for [GoDoxy](https://github.com/yusing/godoxy).

Production builds write static client assets to `dist/client`. The parent GoDoxy module embeds that directory via `embed.go` and serves it as the built-in WebUI `fileserver` route, so the normal deployment path does not need a separate frontend container or standalone WebUI image.

With GoDoxy 0.32.1 or later, configure sleep/wake notifications in **Configuration → Default Values → Idle Sleep Notifications**. Choose all notification providers or select providers by name. These defaults apply to routes with an idle timeout; configure the providers in **Configuration → Notifications**.

In a route's **Idlewatcher** settings, choose **Use defaults**, **Disabled**, or **Selected providers**. Saving uses the existing `defaults.idlewatcher.notify` and `idlewatcher.notify` YAML settings. Disabling a route preserves its explicit empty target list, and opening the editor does not enable notifications.

# iOS Shortcut — Unlock NYT

Mobile fallback for the NYT Library Refresher. Triggers the Worker's `/refresh` endpoint when you hit a paywall on iPhone Safari. Only needed if your Mac (with the Chrome extension) hasn't refreshed your NYT pass in the past 72 hours.

## Build it on your iPhone

1. Open the **Shortcuts** app.
2. Tap **+** (top right) to create a new shortcut.
3. Add these actions in order:

   **Action 1 — Receive URLs from Share Sheet**
   - Tap the **(i)** (shortcut info) at the bottom.
   - Toggle **Show in Share Sheet** ON.
   - Under **Share Sheet Types**, keep only **URLs**.

   **Action 2 — URL Encode**
   - Search for "URL Encode".
   - Input: **Shortcut Input**.
   - Mode: **URL Encode**.

   **Action 3 — Text**
   - Search for "Text".
   - Content: `https://YOUR-WORKER.workers.dev/refresh?next=` then tap **URL Encoded Text** (a blue variable chip) to insert the output of Action 2, then continue typing `&t=YOUR-SHARED-SECRET`.
   - Replace `YOUR-WORKER` with your actual workers.dev subdomain.
   - Replace `YOUR-SHARED-SECRET` with the token you configured in the extension.

   **Action 4 — Open URLs**
   - Search for "Open URLs".
   - URL: **Text** (the output of Action 3).

4. Tap the shortcut name at the top and rename to **Unlock NYT**.
5. Tap **Done**.

## Use it

In Safari on any paywalled NYT article:

1. Tap the share button.
2. Scroll through the share sheet and tap **Unlock NYT**.
3. Safari navigates to your Worker, which redirects to NYT's redeem endpoint, which drops the 72-hour pass on your signed-in NYT account.
4. Tap back to the article or re-open the link — it should be unlocked.

Your NYT iOS app and Mac Chrome will also pick up the 72-hour access since it's account-level.

## Security

The shortcut has your Worker URL and shared secret baked in. Anyone with access to your iPhone can invoke it, which would burn HBPL passes against your account but does not expose any credentials. Do not share the iCloud link for this shortcut publicly.

## iCloud share link

(Fill in after you build the shortcut: long-press the shortcut → Share → Copy iCloud Link, and paste here.)

```
<paste icloud.com/shortcuts/... URL here>
```

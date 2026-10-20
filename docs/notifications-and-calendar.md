# Notifications and calendar

Episodic can tell you when a new episode comes out, and put upcoming episodes in your calendar app.
Each person sets this up for themselves under **Settings**.

## New-episode notifications

Every 10 minutes Episodic looks for episodes that just aired for shows you're **Watching**. To also
cover shows on your **Watchlist**, turn on **Settings → Preferences → Notify for my watchlist too**.

- **Timing.** Episodes with an exact air time are announced at that time. Others are announced at
  09:00 on their air date, in the server's `TZ`.
- **Grouping.** Several episodes of one show released together (a whole season, for example) come
  as one notification.
- **No repeats.** You're never notified twice about the same episode, or about an episode you
  already marked watched.
- **No backlog.** Only episodes from the last 36 hours are announced, so turning notifications on,
  or restarting after downtime, doesn't flood you.

You can send notifications to any mix of these:

### On your phone or computer (Web Push)

This needs the HTTPS address (see [https-tailscale.md](https-tailscale.md)).

- **iPhone or iPad (iOS 16.4 or later):** first install Episodic to the home screen (**Settings →
  Install the app**). Then open the _installed_ app and go to **Settings → Notifications → This
  device → Turn on**, and allow notifications. Safari tabs can't receive push notifications on iOS.
- **Android, Windows, Mac and Linux (Chrome, Edge, Firefox, Safari):** **Settings → Notifications
  → This device → Turn on**.

Turn it on separately on each device that should receive notifications. Tapping a notification
opens the show. To stop notifications on a device, use the bell button next to it in the list.

### ntfy

[ntfy](https://ntfy.sh) is a free push service with apps for Android and iOS. It's handy when you
don't want to install Episodic on a device, and you can also run it yourself, for example as a
CasaOS app.

1. Install the ntfy app and subscribe to a topic with a **hard-to-guess name**, e.g.
   `episodic-7f3k29xq`. Anyone who knows the name can read it on the public server.
2. In Episodic, go to **Settings → Notifications → Add ntfy** and enter the topic address, e.g.
   `https://ntfy.sh/episodic-7f3k29xq` or `https://ntfy.your-server/episodic`.
3. For a protected topic on your own ntfy server, add an access token.

Episodic sends a test notification straight away. Tapping a notification opens the show if
`APP_URL` is set.

### Discord

1. In your Discord server, go to **Server Settings → Integrations → Webhooks → New Webhook**, pick a
   channel, then **Copy Webhook URL**.
2. In Episodic, go to **Settings → Notifications → Add Discord** and paste the URL.

### When something doesn't arrive

- Use the **send** button next to each destination to send a test.
- A failed delivery shows its error under the destination's name.
- An expired device subscription (for example after reinstalling the app) is removed
  automatically. Turn notifications on again from that device.
- Admins can see the `notify-new-episodes` job under **Settings → Background jobs**.

## Calendar feed (iCal)

**Settings → Calendar feed → Create calendar link** gives you a private address like
`https://…/calendar/Xy12…ab.ics`. It lists your episodes and movie releases from 30 days ago to 90
days ahead:

- Episodes with an exact time are timed events with the episode's length.
- Others are all-day events.

Your calendar app checks it for changes every few hours.

| App                 | How to subscribe                                                                                                                                                                              |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **iPhone / iPad**   | Tap **Add to calendar**, or **Settings app → Calendar → Accounts → Add Account → Other → Add Subscribed Calendar**, and paste the link                                                        |
| **Mac Calendar**    | **File → New Calendar Subscription…**, paste the link                                                                                                                                         |
| **Google Calendar** | On the web: **Other calendars → + → From URL**. Google downloads the feed from its own servers, so your Episodic address must be reachable from the internet. A Tailscale address won't work. |
| **Outlook**         | **Add calendar → Subscribe from web**                                                                                                                                                         |

The link works without signing in, so **keep it private**. **New link** replaces it, and the old
one stops working. **Turn off** disables the feed.

## Stats

**Stats** (in the sidebar, or from **History** on a phone) shows:

- time watched, and episodes, movies, titles and completed titles;
- your current and longest streak of days with something watched;
- hours per month for the last 12 months, split into TV shows, anime and movies (with a table view);
- your top genres and most-watched titles.

Switch between **this year** and **all time** at the top. Watch time uses each episode's or movie's
runtime from TMDB/AniList. Where none is known, it assumes 40 minutes for a TV episode, 24 for an
anime episode and 110 for a movie.

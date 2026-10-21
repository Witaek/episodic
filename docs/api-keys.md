# Getting API keys

Episodic gets its show, anime and movie information from public services. **Only TMDB needs a key**,
and it's free for personal use.

| Service                                 | What it provides                                    | Key                 |
| --------------------------------------- | --------------------------------------------------- | ------------------- |
| [TMDB](https://www.themoviedb.org)      | Movies, TV shows, anime episode lists, images, cast | **Required** (free) |
| [AniList](https://anilist.co)           | Anime and manga, exact airing times, sequels        | None                |
| [TVmaze](https://www.tvmaze.com)        | Exact air times for TV shows                        | None                |
| [Open Library](https://openlibrary.org) | Books, editions, covers, ISBN lookup                | None                |
| [Wikidata](https://www.wikidata.org)    | Book series and their order, adaptations            | None                |
| [MangaDex](https://mangadex.org)        | Manga volumes, chapters and volume covers           | None                |
| [BnF](https://catalogue.bnf.fr)         | French editions for ISBN scanning                   | None                |

## TMDB: API Read Access Token

1. Create a free account at [themoviedb.org/signup](https://www.themoviedb.org/signup) and confirm
   your email.
2. Open your [API settings](https://www.themoviedb.org/settings/api): click your avatar, then
   **Settings**, then **API** in the left menu.
3. Click **Create** (or **Request an API key**) and choose **Developer**.
4. Accept the terms of use and fill in the short form:
   - **Type of use:** Personal
   - **Application name:** Episodic
   - **Application URL:** your Episodic address, or `https://github.com/Witaek/episodic`
   - **Application summary:** "Personal self-hosted watch tracker"
5. Back on the API page, copy the **API Read Access Token**. It's the long value that starts with
   `eyJ`, **not** the shorter "API Key".
6. Put it in the `TMDB_ACCESS_TOKEN` variable:
   - **CasaOS:** in the app's settings form.
   - **Docker Compose:** in your `.env` file.

To check it worked, open **Settings** in Episodic: **TMDB** should be green. Then search for any TV
show. (`http://<your-server>:8787/api/health` also shows `"tmdbConfigured": true`.)

**Without a token**, Episodic still works for anime (through AniList), but TV show and movie search
is disabled.

> Keep the token private. It's tied to your TMDB account. If it leaks, you can regenerate it on the
> same API page.

### Attribution

TMDB's terms require apps to credit them. Episodic shows the required notice on its About page:
_"This product uses the TMDB API but is not endorsed or certified by TMDB."_

## Optional keys (later phases)

None of these are needed for v1.0. They will be documented here when the related feature ships.

- **Trakt client ID**: for importing or syncing Trakt history.
- **AniList OAuth client**: for syncing your progress back to your AniList account.
- **Google Books key**: could improve book search in the future; not used today.

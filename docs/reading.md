# Reading: books, series and manga

Episodic has two sides: **Watch** (shows, anime, movies) and **Read** (books, book series, manga).
Switch with the **Watch | Read** toggle at the top of the home screen (or in the sidebar on a
computer). The app remembers the side you were on, and the Read side has its own look: warm amber
and serif headings.

| Read tab    | What it shows                                                                    |
| ----------- | -------------------------------------------------------------------------------- |
| **Reading** | What you're reading now, your yearly goal, books coming soon, Want to read       |
| **Search**  | Books (English or French editions) and manga, with a **Scan** button             |
| **Shelf**   | Your reading library: Plan to read, Reading, Read, On hold, Dropped              |
| **Stats**   | Books and volumes finished, pages, streaks, genres, and your yearly reading goal |
| **History** | Everything you read, day by day (History on the Watch side lists only watching)  |

Settings are shared by both sides.

## Series are tracked like shows

A book that belongs to a series (Harry Potter, The Lord of the Rings, Le Seigneur des anneaux…)
is tracked through its series, the way an episode belongs to a show:

- Searching shows **one card for the series** instead of a card for each of its books.
- The series page lists the books in reading order, with covers and page counts. Tap ✓ to mark a
  book read, or use ⋯ for "mark all up to here", a date, or reading it again.
- While a book is in progress, its page appears under it and on the Reading screen.
- The series stays **Reading** until every book is read. Books announced but not out yet show as
  _Coming soon_ and appear on the Reading screen.
- Opening a single book that is part of a series shows "Book 3 of …" with a link to the series,
  and its buttons track it in the series.

Series come from [Wikidata](https://www.wikidata.org), which links Open Library books to their
series and position. If you tracked a book on its own before it was known to be in a series, a
daily job (and opening the book's page) moves its reads, page and status into the series.

### Series Wikidata doesn't know

On a book's page, **Part of a series?** groups it yourself: create a new series (its name and the
book's number are guessed from titles like "…, tome 2") or add the book to one you made before.
Hand-made series are shared by everyone on your server and are included in your export. In a
hand-made series, ⋯ → **Remove from this series** takes a book out again (its reads go back to the
book itself).

## Manga

Manga come from [AniList](https://anilist.co), with volumes and chapters from
[MangaDex](https://mangadex.org):

- Volumes are shown as a shelf of covers with your progress on each.
- Pick a volume to see its chapters. Tap a chapter to mark it read, or **Mark volume read**. With
  **Catch up** on, tapping a chapter also marks every earlier one.
- Where MangaDex doesn't list a volume's chapters (common for licensed series), Episodic spreads the
  chapters evenly between known volumes and says so.

## Films and anime made from what you read

Book, series and manga pages list their **adaptations**: films and series (from Wikidata and TMDB),
and for manga, the anime (through AniList). Each card shows whether you watched it. The other way
round, anime and film pages show the manga or book they're **based on**.

## Yearly reading goal

On **Stats**, set how many books you want to read this year. Books, books of a series and finished
manga volumes all count. The Reading screen shows the goal as a ring and tells you whether you're
ahead of or behind a steady pace. Set 0 to remove it. A new year starts without a goal.

## Scanning a barcode

**Read → Scan a book** (or **Scan** on the search screen) reads the ISBN barcode on a back cover
with your phone's camera. Episodic finds that exact edition (so the title and cover match your
copy) and tells you which series it's part of. From there you can open it, open the series, or add
it to Want to read in one tap. You can also type an ISBN.

- The camera only works on an HTTPS address, such as your Tailscale address
  ([HTTPS with Tailscale](https-tailscale.md)). On a plain `http://` address, type the ISBN instead.
- Android Chrome uses the phone's built-in barcode reader. On iPhone a small WebAssembly reader is
  used; it is served by Episodic itself, so nothing is loaded from other sites.

## Book language

Book search remembers whether you picked **English**, **Français** or **Any**. That choice is also the
language series and manga pages are shown in.

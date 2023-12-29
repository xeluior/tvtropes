# TvTropes

1. The base for all links is (https://tvtropes.org/pmwiki/)
2. TVTropes is organized into Namespaces.
3. The list of namespaces can be obtained from (articlecount.php)
3. Each namespace is listed as "0000: Name" with `<br/>` between each within the fourth `<p>` subelement within the `#wikimiddle` `<div>`
4. The list of articles in a Namespace can be obtained from (namespace_index.php?ns=)
5. Both (3) and (4) links have multiple pages.
6. The last page number can be found from the `data-total-pages` attribute on the only `.pagination-box` element on any of the pages
7. Pages can be navigated to with the `?page=` query
7. Not having a page number is equivelent to `?page=1`
8. All links to other TVTropes pages have the `.twikilink` class
8. The link to these pages is (pmwiki.php/Namespace/Identifier)
8. These pages will have a title found in an `h1` with the `.entry-title` class
8. The title `h1` will also have a `strong` tag with "Namespace /" prepended to the text if it is not in the Main namespace
9. A link should either be either Broken 404, Redirect 302, or exist 2xx
9. A Redirect will have a `div` with the `.aka-title` in it's title `h1` (some dont?)
9. The above is a hoax. The `.aka-title` will repeat anything in the second part of the `?from=` query with captials replaced by "\s[A-Z]" as appropriate
10. A Redirect will change the link to (pmwiki.php/Namespace/Identifier?from=OldNamespace.OldIdentifier)
11. There is only one definitive link that multiple redirects can send to
12. Pages that exist have multiple `.twikilink`s on them that serve as graph edges
13. A page can be identified by a combination of (Namespace, ID)
14. The ID is normally the Title with all non alphanumeric characters dropped
15. IDs and Namespaces should be compared case insensitively
16. Too much crawling may incur a rate limit

# Sqlite3

1. A Sqlite3 DB can only have one writer
2. A reader will error if it attempts to access the DB while it is processing a transaction
3. For these reasons, Sqlite3 is easiest if only 1 thread accesses it

# Concurrent Ruby
~~2. `Concurrent::Array` could be used as a queue via the `Array#push` and `Array#shift` methods~~
1. Ruby has a builtin thread-safe `Queue` class
2. The `ruby-concurrency` gem provides thread safe for all other purposes
3. A new thread can be created using `Thread.new` and providing a block

# General plan

## Database Schema

We wil use my original database schema with some extensions.

```sql
create table if not exists pages (
  namespace text collate nocase not null,
  id text collate nocase not null,
  response integer,
  title text,
  alias_of_namespace text collate nocase,
  alias_of_id text collate nocase,
  primary key (namespace, id) on conflict replace,
  foreign key (alias_of_namespace, alias_of_id) references pages (namespace, id) on delete set null
);
```

This table represents a wiki page (one of the pmwiki.php links). The `alias_of` foreign keys setup the many to one relationship that redirects can have with another page. The `title` column will be the contents of the title `h1` for most pages, but for redirects it will be the contents of the `aka-title` minus the preceding "Aka: " text. Broken links will have no title.

```sql
create table if not exists links (
  namespace text collate nocase not null,
  id text collate nocase not null,
  link_namespace text collate nocase not null,
  link_id text collage nocase not null,
  primary key (namespace, id, link_namespace, link_id) on conflict ignore,
  foreign key (namespace, id) references pages (namespace, id) on delete cascade,
  foreign key (namespace, id) references pages (link_namespace, link_id) on delete cascade,
);
```

This table represents the many-to-many links between wiki pages. A link can only be uniquely identified by both the starting and ending pages. Due to the nature of the Tvtropes, this table represents a directed graph, since not all pages link back to pages that link to them.

## Web Crawler

For completeness, the web crawler will be seeded with every Namespace from the [Article Count](https://tvtropes.org/pmwiki/articlecount.php) page. The first task will be to crawl every [Namespace Index](https://tvtropes.org/pmwiki/namespace_index.php?ns=) for seed pages. There will be 4 work queues: Article Count, Namespace, Wiki, and SQL. The function of each queue is described below. The number of data each of the queues processes will get successively larger.

### Article Count

This work queue will be seeded with all the articlecount.php pages. Workers will parse each page for the namespaces therein and each namespace will become a link on the namespace queue equal to "namespace_index.php?ns=<the new namespace>".

### Namespace

To prevent duplication, a worker will read the Namespace link, if the query contains the `page=` parameter it will process all `.twikilinks` on the page and add them to the Wiki queue. Otherwise, it will determine how many pages are in the Namespace Index and add `page=2` through `page=<count>` onto the Namespace queue before processing the page as `page=1`.

### Wiki

The wiki queue will perform the data gathering for the database from the Wiki links the Namespace workers find. A `Concurrent::Set` of visited links will The worker will perform these actions:

1. Read a link from the work queue
2. Attempt to put that link into the visited links set
3. On failure, return to 1
4. Open the link and gather the data needed for the SQL tables
5. Push new `.twikilink`s onto the Wiki Queue
6. Push this data onto the SQL queue

```
{
  namespace,
  id,
  response,
  title,
  alias_of_namespace,
  alias_of_id,
  links: [
    { namespace, id }
  ]
}
```

### SQL

There will only be one worker operating on the SQL queue. It will persist a connection to the sqlite database, wait for data on the SQL queue, parse and insert that data to the database.

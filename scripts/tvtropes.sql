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
create table if not exists links (
  namespace text collate nocase not null,
  id text collate nocase not null,
  link_namespace text collate nocase not null,
  link_id text collate nocase not null,
  primary key (namespace, id, link_namespace, link_id) on conflict ignore,
  foreign key (namespace, id) references pages (namespace, id) on delete cascade,
  foreign key (namespace, id) references pages (link_namespace, link_id) on delete cascade
);


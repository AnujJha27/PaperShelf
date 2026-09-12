alter table public.feeds
  add column min_publication_year int not null default 2018
  check (min_publication_year between 1900 and 2100);

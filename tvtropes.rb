require 'net/http'
require 'nokogiri'
require 'sqlite3'
require 'etc'

CPU_THREADS = Etc.nprocessors
PROTO = 'https://'.freeze
ROOT_URL = 'tvtropes.org'.freeze

@articlecount_q = Queue.new
@namespace_q = Queue.new
@wiki_q = Queue.new
@sql_q = Queue.new

visited_pages = Set.new
db = SQLite3::Database.open 'tvtropes.db'
def absolute(url_or_path)
  if url_or_path.start_with? PROTO
    url_or_path
  elsif url_or_path.start_with? 'http://'
    url_or_path.sub('http://', PROTO)
  elsif url_or_path.start_with? ROOT_URL
    "#{PROTO}url_or_path"
  elsif url_or_path.start_with? '/'
    "#{PROTO}#{ROOT_URL}#{url_or_path}"
  else
    "#{PROTO}#{ROOT_URL}/#{url_or_path}"
  end
end

def escape(url)
  allowed = %r{[\w\d\[\].:-_~/?#@!$&'()*=+,;%]}
  new_url = ''
  url.each_char do |char|
    if allowed.match char
      new_url << char
    else
      char.each_byte { |b| new_url << "%#{b.to_s(16)}" }
    end
  end
  URI.parse(new_url)
end

def get(url)
  sleep_timer = 60 # seconds
  response = Net::HTTP.get_response(url)
  while response.is_a? Net::HTTPForbidden
    # we are being rate limited
    sleep sleep_timer
    sleep_timer = (sleep_timer + 60) % 600
    response = Net::HTTP.get_response(url)
  end

  response
end

articlecount_worker = lambda do
  url = @articlecount_q.pop
  content = get(url)
  html = Nokogiri::HTML5.parse(content.body)
  wikimiddle = html.at_css('#wikimiddle')
  namespace_list = wikimiddle.children[-2].children.select { |item| item.name == 'text' }
  namespace_list.each do |item|
    name = /\d+: (\w+)/.match(item.content)
    index = escape(absolute("/pmwiki/namespace_index.php?ns=#{name[1]}")) unless name.nil?
    @namespace_q.push(index) unless index.nil?
  end
end

namespace_worker = lambda do
  url = @namespace_q.pop
  content = get(url)
  html = Nokogiri::HTML5.parse(content.body)
  unless url.query.include? 'page'
    pagination_box = html.at_css('.pagination-box')
    unless pagination_box.nil?
      pages = pagination_box['data-total-pages'].to_i - 1
      pages.times do |i|
        @namespace_q.push escape("#{url}&page=#{i + 2}")
      end
    end
  end
  html.css('.twikilink').each do |link|
    @wiki_q.push escape(absolute(link['href']))
  end
end

wiki_worker = lambda do
  # get url and check if it's been visited
  url = @wiki_q.pop
  return unless visited_pages.add? url

  # get initial metadata
  path = url.path.split '/'
  response = get(url)
  data = { namespace: path[3], id: path[4], response: response.code.to_i }

  # deal with redirects
  redirect_count = 0
  while response.is_a?(Net::HTTPFound) && redirect_count < 10
    next_url = escape(absolute(response['Location']))
    response = get(next_url)
    redirect_count += 1
  end

  if redirect_count.positive?
    path = response.uri.path.split '/'
    data[:alias_of_namespace] = path[3]
    data[:alias_of_id] = path[4]
  end

  # escape early if there's no body to parse
  if response.body.empty?
    @sql_q.push data
    return
  end

  # parse title
  html = Nokogiri.parse(response.body)
  data[:title] = if redirect_count.positive? && !(aka_title = html.at_css('.aka-title')).nil?
                   aka_title.content.strip.sub('aka: ', '')
                 else
                   header = html.at_css('.entry-title')&.children&.select { |c| c.name == 'text' }
                   header[1]&.content&.strip unless header.nil?
                 end

  # escape early if this is an alias, links will be read on the main page
  if redirect_count.positive?
    @wiki_q.push escape(response.uri.to_s.sub(response.uri.query || '', ''))
    @sql_q.push data
    return
  end

  # parse links
  data[:links] = Set.new
  html.css('.twikilink').each do |link|
    link_url = escape(absolute(link['href']))
    path = link_url.path.split '/'
    data[:links].add?({ namespace: path[3], id: path[4] })
    @wiki_q.push link_url
  end

  @sql_q.push data
end

sql_worker = lambda do
  while @sql_q.size.positive?
    data = @sql_q.pop
    links = data.delete(:links)
    db.execute 'insert into pages values ( ?, ?, ?, ?, ?, ? )',
               [data[:namespace], data[:id], data[:response], data[:title], data[:alias_of_namespace],
                data[:alias_of_id]]
    links&.each do |link|
      db.execute 'insert into links values ( ?, ?, ?, ? )', [data[:namespace], data[:id], link[:namespace], link[:id]]
    end
  end
end

# seed the articlecount_q
# 37 is the current number of articlecount.php pages
37.times do |i|
  @articlecount_q.push escape(absolute("/pmwiki/articlecount.php?page=#{i + 1}"))
end

# schedule threads to run
@sql_thr = Thread.new { nil }
@art_thrs = []
@ns_thrs = []
@wiki_thrs = []

# run until nothing is left waiting
def total_waiting
  @articlecount_q.size + @namespace_q.size + @wiki_q.size + @sql_q.size
end

def threads
  [@sql_thr, *@art_thrs, *@ns_thrs, *@wiki_thrs]
end

def total_running
  threads.select(&:alive?).count
end

def awake
  threads.reject { |thr| thr.status == 'sleep' }
end

while total_waiting.positive?
  print <<~STATS
    Queues
      Articlecount: #{@articlecount_q.size.to_s.rjust 2}
      Namespaces: #{@namespace_q.size.to_s.rjust 4}
      Pages: #{@wiki_q.size.to_s.rjust 9}
      SQL: #{@sql_q.size.to_s.rjust 11}
    Threads (Max #{CPU_THREADS})
      Articlecount: #{@art_thrs.select(&:alive?).count.to_s.rjust 2}
      Namespaces:   #{@ns_thrs.select(&:alive?).count.to_s.rjust 2}
      Pages:        #{@wiki_thrs.select(&:alive?).count.to_s.rjust 2}
      SQL:           #{@sql_thr.alive? ? '1' : '0'}\r\e[10A
  STATS
  $stdout.flush

  # cleanup dead threads
  @art_thrs = @art_thrs.select(&:alive?)
  @ns_thrs = @ns_thrs.select(&:alive?)
  @wiki_thrs = @wiki_thrs.select(&:alive?)

  # block until we need to do something
  if total_running >= CPU_THREADS
    sleep 1
    next
  end

  # schedule a thread
  if @sql_q.size.positive? && !@sql_thr.alive?
    @sql_thr = Thread.new(&sql_worker)
  elsif @namespace_q.size < 100 * @articlecount_q.size
    @art_thrs << Thread.new(&articlecount_worker)
  elsif @wiki_q.size < 10 * @namespace_q.size
    @ns_thrs << Thread.new(&namespace_worker)
  else
    @wiki_thrs << Thread.new(&wiki_worker)
  end
end

threads.each(&:join)

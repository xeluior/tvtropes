require 'net/http'
require 'nokogiri'
require 'sqlite3'
require 'etc'

CPU_THREADS = Etc.nprocessors
ROOT_URL = 'https://tvtropes.org'.freeze

@articlecount_q = Queue.new
@namespace_q = Queue.new
@wiki_q = Queue.new
@sql_q = Queue.new

visited_pages = Set.new
db = SQLite3::Database.open 'tvtropes.db'

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
    sleep(sleep_timer)
    sleep_timer += 60
    response = Net::HTTP.get_response(url)
  end

  response
rescue Errno::ECONNREFUSED
  puts url
  Thread.current.kill
end

articlecount_worker = lambda do
  url = @articlecount_q.pop
  content = get(url)
  html = Nokogiri::HTML5.parse(content.body)
  wikimiddle = html.at_css('#wikimiddle')
  namespace_list = wikimiddle.children[-2].children.select { |item| item.name == 'text' }
  namespace_list.each do |item|
    name = /\d+: (\w+)/.match(item.content)
    index = escape("#{ROOT_URL}/pmwiki/namespace_index.php?ns=#{name[1]}") unless name.nil?
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
    @wiki_q.push escape("#{ROOT_URL}#{link['href']}")
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
    next_url = escape("#{ROOT_URL}#{response['Location']}")
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
  data[:title] = if redirect_count.positive?
                   html.at_css('.aka-title').content.strip.sub('aka: ', '')
                 else
                   header = html.at_css('.entry-title').children.select { |c| c.name == 'text' }
                   header[1].content.strip
                 end

  # parse links
  data[:links] = Set.new
  html.css('.twikilink').each do |link|
    path = link['href'].split '/'
    data[:links].add?({ namespace: path[3], id: path[4] })
    @wiki_q.push escape("#{ROOT_URL}#{link['href']}")
  end

  @sql_q.push data
end

sql_worker = lambda do
  while @sql_q.size.positive?
    data = @sql_q.pop
    links = data.delete(:links)
    db.execute 'insert into pages values ( ?, ?, ?, ?, ?, ? )', data.values
    links.each do |link|
      db.execute 'insert into links values ( ?, ?, ?, ? )', [data[:namespace], data[:id], link[:namespace], link[:id]]
    end
  end
end

# seed the articlecount_q
# 37 is the current number of articlecount.php pages
37.times do |i|
  @articlecount_q.push escape("#{ROOT_URL}/pmwiki/articlecount.php?page=#{i + 1}")
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
      Articlecount: #{@articlecount_q.size}
      Namespaces: #{@namespace_q.size}
      Pages: #{@wiki_q.size}
      SQL: #{@sql_q.size}
    Threads (Max #{CPU_THREADS})
      Articlecount: #{@art_thrs.select(&:alive?).count}
      Namespaces: #{@ns_thrs.select(&:alive?).count}
      Pages: #{@wiki_thrs.select(&:alive?).count}
      SQL: #{@sql_thr.alive? ? '1' : '0'}\r\e[10A
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

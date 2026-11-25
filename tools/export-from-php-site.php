<?php
/**
 * Copies all content of the PHP version (database + page texts + pictures) into the
 * folder structure of the static version.
 *   php export-from-php-site.php /path/to/osi-site /path/to/new-repo/content
 */
declare(strict_types=1);

[$self, $site, $out] = $argv + [null, null, null];
if (!$site || !$out) {
    exit("Usage: php export-from-php-site.php OLD_SITE_FOLDER CONTENT_FOLDER\n");
}
$_SERVER['SCRIPT_NAME'] = '/index.php';
require rtrim($site, '/') . '/app/bootstrap.php';

/* ---------- small YAML writer: plain keys, JSON-quoted strings, blocks for long text ---------- */
function y_scalar($v, string $ind): string
{
    if (is_bool($v)) return $v ? 'true' : 'false';
    if (is_int($v) || is_float($v)) return (string) $v;
    if ($v === null) return '""';
    $v = (string) $v;
    if (str_contains($v, "\n")) {
        return "|-\n" . implode("\n", array_map(fn ($l) => $l === '' ? '' : $ind . '  ' . $l, explode("\n", $v)));
    }
    return json_encode($v, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
}
function yaml($data, string $ind = ''): string
{
    $out = '';
    if (array_is_list($data)) {
        foreach ($data as $item) {
            if (is_array($item) && $item !== []) {
                $body = yaml($item, $ind . '  ');
                $out .= $ind . '- ' . ltrim($body);
            } else {
                $out .= $ind . '- ' . (is_array($item) ? '[]' : y_scalar($item, $ind . '  ')) . "\n";
            }
        }
        return $out;
    }
    foreach ($data as $k => $v) {
        if (is_array($v)) {
            $out .= $v === [] ? "$ind$k: []\n" : "$ind$k:\n" . yaml($v, $ind . '  ');
        } else {
            $out .= "$ind$k: " . y_scalar($v, $ind) . "\n";
        }
    }
    return $out;
}
function write(string $path, string $text): void
{
    if (!is_dir(dirname($path))) mkdir(dirname($path), 0755, true);
    file_put_contents($path, $text);
}
function frontmatter(array $meta, string $body): string
{
    return "---\n" . yaml($meta) . "---\n" . ($body !== '' ? "\n" . rtrim($body) . "\n" : '');
}

/* ---------- pictures: copied under readable names ---------- */
$names = [];
$pictureByFile = [];
foreach (media_all() as $m) {
    $base = slugify(pathinfo($m['original_name'], PATHINFO_FILENAME)) ?: 'picture';
    $ext  = pathinfo($m['filename'], PATHINFO_EXTENSION);
    $name = $base . '.' . $ext;
    for ($i = 2; isset($names[$name]); $i++) $name = "$base-$i.$ext";
    $names[$name] = true;
    $src = rtrim((string) cfg('upload_dir'), '/') . '/' . $m['filename'];
    if (is_file($src)) {
        write("$out/uploads/$name", file_get_contents($src));
    }
    $pictureByFile[$m['filename']] = ['path' => '/uploads/' . $name, 'alt' => $m['alt']];
}
$pic = fn (?array $media) => $media ? $pictureByFile[$media['filename']] ?? null : null;

/* ---------- old formatting to Markdown ---------- */
/** Addresses of filtered news lists changed: /news?label=x is now /news/label/x/ and so on. */
function fix_urls(string $text): string
{
    $text = preg_replace('~/news\?dated=1~', '/news/dates/', $text);
    $text = preg_replace('~/news\?label=([a-z0-9-]+)~', '/news/label/$1/', $text);
    return preg_replace('~/news\?section=([a-z0-9-]+)~', '/news/area/$1/', $text);
}

function md(string $text): string
{
    $text = fix_urls($text);
    $text = preg_replace('~<a\s+href="([^"]*)"\s*>(.*?)</a>~is', '[$2]($1)', $text);
    $text = preg_replace('~</?(?:strong|b)>~i', '**', $text);
    $text = preg_replace('~</?(?:em|i)>~i', '*', $text);
    return $text;
}
function md_body(string $text, array $pictureByFile): string
{
    // a line that was a picture address becomes a Markdown picture
    return preg_replace_callback('~^(?:https?://[^\s/]+)?(?:/[^\s]*)?/uploads/([0-9a-f]{24}\.(?:jpg|png))$~m', function ($m) use ($pictureByFile) {
        $p = $pictureByFile[$m[1]] ?? null;
        return $p ? '![' . $p['alt'] . '](' . $p['path'] . ')' : $m[0];
    }, md($text));
}
function md_deep($value)
{
    if (is_array($value)) return array_map('md_deep', $value);
    return is_string($value) ? md($value) : $value;
}

/* ---------- settings ---------- */
write("$out/settings.yml", yaml(['contact_email' => cfg('contact_email'), 'site_name' => cfg('site_name')]));

/* ---------- pages ---------- */
$strip = function (array $columns): array {
    return array_map(fn ($c) => ['title' => $c['title'], 'points' => $c['points']], $columns);
};
$home = page_content('home');
write("$out/pages/home.yml", yaml(md_deep([
    'hero'       => $home['hero'],
    'events_box' => $home['events_box'],
    'pillars'    => $home['pillars'],
    'news'       => $home['news'],
    'activities' => ['label' => $home['activities']['label'], 'title' => $home['activities']['title'], 'columns' => $strip($home['activities']['columns'])],
    'boxes'      => $home['boxes'],
    'join'       => $home['join'],
])));
foreach (array_keys(SECTIONS) as $area) {
    $c = page_content($area);
    write("$out/pages/$area.yml", yaml(md_deep([
        'hero'       => $c['hero'],
        'aside'      => $c['aside'],
        'topics'     => ['label' => $c['topics']['label'], 'title' => $c['topics']['title']],
        'activities' => ['title' => $c['activities']['title'], 'columns' => $strip($c['activities']['columns'])],
        'people'     => $c['people'],
        'join'       => $c['join'],
    ])));
    foreach ($c['topics']['cards'] as $n => $card) {
        $page    = $card['page'] ?? [];
        $picture = $pic(media_get((int) ($page['picture'] ?? 0) ?: null));
        $meta    = ['title' => $card['title'], 'summary' => md($card['text']), 'order' => ($n + 1) * 10];
        if ($picture) { $meta['picture'] = $picture['path']; $meta['picture_alt'] = $picture['alt']; }
        if (($card['link']['url'] ?? '') !== '') { $meta['link_text'] = $card['link']['text']; $meta['link_url'] = fix_urls($card['link']['url']); }
        write("$out/topics/$area/{$card['id']}.md", frontmatter($meta, md_body((string) ($page['body'] ?? ''), $pictureByFile)));
    }
}
foreach (['team', 'news'] as $key) {
    write("$out/pages/$key.yml", yaml(md_deep(page_content($key))));
}
foreach (['impressum' => 'imprint', 'privacy' => 'privacy', 'accessibility' => 'accessibility'] as $key => $file) {
    $c = page_content($key);
    write("$out/pages/$file.md", frontmatter(['title' => $c['title']], md_body($c['body'], $pictureByFile)));
}

/* ---------- news ---------- */
foreach (news_list(['published' => false]) as $n) {
    $meta = ['title' => $n['title'], 'date' => $n['date']];
    if ($n['teaser'] !== '') $meta['summary'] = $n['teaser'];
    if ($p = $pic($n['image'])) { $meta['image'] = $p['path']; $meta['image_alt'] = $p['alt']; }
    $meta['labels'] = implode(', ', array_column($n['labels'], 'name'));
    $meta['show_on'] = array_merge(['home'], $n['sections']);
    $meta['featured'] = (bool) $n['featured'];
    $meta['draft']    = $n['status'] !== 'published';
    if ($n['is_event']) {
        $meta += array_filter(['date_to_remember' => true, 'event_type' => $n['event_type'], 'event_start' => $n['event_start'], 'event_end' => $n['event_end'], 'event_time' => $n['event_time'], 'event_place' => $n['event_place']], fn ($v) => $v !== '');
    }
    write("$out/news/{$n['date']}-{$n['slug']}.md", frontmatter($meta, md_body($n['body'], $pictureByFile)));
}

/* ---------- team ---------- */
foreach (members_all() as $m) {
    $meta = ['name' => $m['name'], 'expertise' => $m['expertise'], 'institute' => $m['institute'], 'order' => (int) $m['sort']];
    if ($p = $pic($m['photo'])) $meta['photo'] = $p['path'];
    foreach (array_keys(SECTIONS) as $area) {
        $meta['area_' . str_replace('-', '_', $area)] = !isset($m['sections'][$area]) ? 'none' : ($m['sections'][$area] ? 'head' : 'member');
    }
    $slug = slugify($m['name']) ?: 'member';
    $file = "$out/team/$slug.md";
    for ($i = 2; is_file($file); $i++) $file = "$out/team/$slug-$i.md";
    write($file, frontmatter($meta, ''));
}
echo "Exported to $out\n";

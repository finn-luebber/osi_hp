/** Build settings. Editors never need to touch this file. */
import { HtmlBasePlugin } from '@11ty/eleventy';
import { writeCmsFiles } from './lib/cms-config.js';
import { writePictures } from './lib/pictures.js';

// When the site is not at the top of its domain (for example https://user.github.io/website/),
// the build sets PATH_PREFIX to "/website/", and every link and picture address is adjusted.
const pathPrefix = process.env.PATH_PREFIX || '/';

export default function (eleventyConfig) {
  eleventyConfig.addPlugin(HtmlBasePlugin);
  eleventyConfig.addPassthroughCopy({ 'src/assets': 'assets' });
  eleventyConfig.addPassthroughCopy({ 'admin/decap': 'admin/decap', 'admin/session-guard.js': 'admin/session-guard.js' });
  // web server rules for Apache (ignored by other servers)
  eleventyConfig.addPassthroughCopy({ 'deploy/apache/htaccess': '.htaccess' });
  eleventyConfig.addWatchTarget('content/');
  eleventyConfig.addWatchTarget('admin/cms.yml');
  // a row of news cards shows pictures only when at least one of its items has one
  eleventyConfig.addFilter('anyImage', (items) => (items || []).some((i) => i.image));
  eleventyConfig.setNunjucksEnvironmentOptions({ autoescape: true, throwOnUndefined: false });
  eleventyConfig.on('eleventy.after', async ({ directories, dir }) => {
    const out = directories?.output || dir.output;
    await writePictures(out);
    writeCmsFiles(out, pathPrefix);
  });
  return {
    pathPrefix,
    dir: { input: 'src', output: '_site', includes: '_includes', data: '_data' },
    templateFormats: ['njk'],
    htmlTemplateEngine: 'njk',
  };
}

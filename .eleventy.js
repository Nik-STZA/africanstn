const markdownIt = require("markdown-it");

module.exports = function(eleventyConfig) {
  // Render a markdown string to HTML (used for the Supabase-sourced weekly
  // briefs). html:false keeps any raw HTML in the source from being injected.
  const md = markdownIt({ html: false, linkify: true, typographer: true });
  eleventyConfig.addFilter("markdownify", function(value) {
    if (!value) return "";
    return md.render(value);
  });

  // Copy static assets directly to output
  // Copy contents of static/ directly to site root
  // so /static/assets/css/ becomes /assets/css/
  eleventyConfig.addPassthroughCopy({"static": "."});

  // Watch CSS and JS for changes
  eleventyConfig.addWatchTarget("static/assets/css/");
  eleventyConfig.addWatchTarget("static/assets/js/");

  // Add a filter to convert newlines to <br> in templates
  eleventyConfig.addFilter("nl2br", function(value) {
    if (!value) return "";
    return value.replace(/\n/g, "<br>");
  });

  // Add a filter to split pipe-separated lists
  eleventyConfig.addFilter("splitList", function(value) {
    if (!value) return [];
    return value.split("|").map(s => s.trim()).filter(s => s);
  });

  return {
    dir: {
      input: "src",
      output: "_site",
      includes: "_includes",
      data: "_data"
    },
    templateFormats: ["njk", "html", "md"],
    htmlTemplateEngine: "njk",
    markdownTemplateEngine: "njk"
  };
};

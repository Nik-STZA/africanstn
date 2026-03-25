module.exports = function(eleventyConfig) {
  // Copy static assets directly to output
  eleventyConfig.addPassthroughCopy("static");

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

import { feedPlugin } from "@11ty/eleventy-plugin-rss";
import markdownIt from "markdown-it";
import markdownItFootnote from "markdown-it-footnote";

export default function (eleventyConfig) {
  // Markdown with footnote support for academic citations
  const md = markdownIt({ html: true, linkify: true, typographer: true })
    .use(markdownItFootnote);
  eleventyConfig.setLibrary("md", md);

  // RSS feed
  eleventyConfig.addPlugin(feedPlugin, {
    type: "atom",
    outputPath: "/feed.xml",
    collection: {
      name: "analyses",
      limit: 20,
    },
    metadata: {
      language: "en",
      title: "Rhetorical Autopsy",
      subtitle: "Structural analysis of divisive content",
      base: "https://rhetorical-autopsy.com/",
      author: {
        name: "Rhetorical Autopsy",
      },
    },
  });

  // Passthrough copy for static assets
  eleventyConfig.addPassthroughCopy("src/assets/css");
  eleventyConfig.addPassthroughCopy("src/assets/img");

  // Collection: analyses sorted by date descending
  eleventyConfig.addCollection("analyses", (collectionApi) => {
    return collectionApi
      .getFilteredByGlob("src/analysis/**/*.md")
      .sort((a, b) => b.date - a.date);
  });

  // Date formatting filters
  eleventyConfig.addFilter("isoDate", (date) => {
    return new Date(date).toISOString();
  });

  eleventyConfig.addFilter("readableDate", (date) => {
    return new Date(date).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  });

  // Excerpt filter — first paragraph of content
  eleventyConfig.addFilter("excerpt", (content) => {
    if (!content) return "";
    const match = content.match(/<p>(.*?)<\/p>/s);
    return match ? match[1].replace(/<[^>]+>/g, "") : "";
  });

  return {
    dir: {
      input: "src",
      output: "_site",
      includes: "_includes",
      data: "_data",
    },
    markdownTemplateEngine: "njk",
    htmlTemplateEngine: "njk",
  };
}

import path from "node:path";

export default {
  layout: "layouts/analysis.njk",
  tags: ["analysis"],
  eleventyComputed: {
    permalink: (data) => {
      const stem = path.basename(data.page.inputPath, ".md");
      return `analysis/${stem}/index.html`;
    },
  },
};

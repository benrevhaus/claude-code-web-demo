import { readFileSync, writeFileSync } from "fs";

let html = readFileSync("dist/index.html", "utf8");

// Remove type="module" for file:// compatibility
html = html.replace(/<script type="module" crossorigin>/g, "<script>");

// Move inlined script from <head> to end of <body> so #root exists when it runs
const m = html.match(/<head>([\s\S]*?)<script>([\s\S]*?)<\/script>([\s\S]*?)<\/head>/);
if (m) {
  html = html.replace(/<head>[\s\S]*?<\/head>/, "<head>" + m[1] + m[3] + "</head>");
  html = html.replace(/<\/body>/, "<script>" + m[2] + "<\/script>\n  </body>");
}

writeFileSync("dist/index.html", html);
console.log("dist/index.html patched for file:// loading");

import { readFileSync, writeFileSync } from "fs";

let html = readFileSync("dist/index.html", "utf8");

// Find and extract the module script from <head>
const headEnd = html.indexOf("</head>");
const headSection = html.slice(0, headEnd);
const rest = html.slice(headEnd);

const scriptOpen = '<script type="module" crossorigin>';
const scriptStart = headSection.indexOf(scriptOpen);
if (scriptStart === -1) {
  console.log("No module script found in <head>, skipping.");
  process.exit(0);
}

const codeStart = scriptStart + scriptOpen.length;
const closingScript = headSection.lastIndexOf("</script>");
const jsCode = headSection.slice(codeStart, closingScript);

// Remove script from head
const headClean = headSection.slice(0, scriptStart) + headSection.slice(closingScript + "</script>".length);

// Base64-encode the JS so no HTML parsing issues with </script> in content
const b64 = Buffer.from(jsCode, "utf8").toString("base64");

// Loader: decode base64 → blob URL → load as module script
const loader = `<script>
(function(){
  var b64="${b64}";
  var bin=atob(b64);
  var blob=new Blob([bin],{type:"application/javascript"});
  var s=document.createElement("script");
  s.type="module";
  s.src=URL.createObjectURL(blob);
  document.body.appendChild(s);
})();
</script>`;

const finalHtml = headClean + rest.replace("</body>", loader + "\n</body>");

writeFileSync("dist/index.html", finalHtml);
const sizeKB = (Buffer.byteLength(finalHtml) / 1024).toFixed(0);
console.log(`dist/index.html patched (${sizeKB} KB): base64 blob loader for file:// compatibility`);

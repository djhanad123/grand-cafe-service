const fs = require('fs');
const path = require('path');

const filePath = 'C:\\Users\\Hanad\\.gemini\\antigravity\\brain\\e4bc82e0-079e-4790-befb-6a1c534672ca\\.system_generated\\steps\\1120\\content.md';

if (!fs.existsSync(filePath)) {
  console.log("File not found:", filePath);
  process.exit(1);
}

const content = fs.readFileSync(filePath, 'utf8');
console.log("Total length:", content.length);

// Let's print out text around common drink names or see what kinds of strings we have
// Or try to extract text inside JSON or scripts or standard tags
// Let's search for some strings:
const matches = [];
const regex = /"[^"]*(?:latte|cappuccino|mocha|coffee|espresso|tea|juice|soda|mocktail|shake)[^"]*"/gi;
let match;
while ((match = regex.exec(content)) !== null) {
  matches.push(match[0]);
  if (matches.length > 50) break;
}

console.log("Sample matches:");
console.log(matches.slice(0, 30));

// Let's also do a general search for any words of interest or find script blocks
// containing PDF data or JSON data.
// Acrobat web viewer often contains JSON in script tags, like "viewport", "meta", etc.
const scriptRegex = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
let scriptCount = 0;
let jsonScripts = [];
while ((match = scriptRegex.exec(content)) !== null) {
  scriptCount++;
  const scriptContent = match[1];
  if (scriptContent.includes('window.__initialState') || scriptContent.includes('initialData') || scriptContent.includes('bootstrap') || scriptContent.includes('adobe')) {
    jsonScripts.push({ index: scriptCount, length: scriptContent.length, snippet: scriptContent.substring(0, 300) });
  }
}
console.log("Script count:", scriptCount);
console.log("JSON/Adobe scripts found:", jsonScripts);

#!/usr/bin/env node
/**
 * generate-sets.js
 * 
 * Run this script to duplicate set-1.json into set-4 through set-10
 * for testing purposes. In production, replace these with your real
 * scraped question JSON files.
 * 
 * Usage:
 *   node scripts/generate-sets.js
 */

const fs = require("fs");
const path = require("path");

const dataDir = path.join(__dirname, "..", "data");
const sourceFile = path.join(dataDir, "set-1.json");

if (!fs.existsSync(sourceFile)) {
  console.error("data/set-1.json not found — run from project root");
  process.exit(1);
}

const baseQuestions = JSON.parse(fs.readFileSync(sourceFile, "utf-8"));

for (let i = 4; i <= 10; i++) {
  const targetFile = path.join(dataDir, `set-${i}.json`);
  if (!fs.existsSync(targetFile)) {
    // Add a set marker to each question so you can tell them apart
    const tagged = baseQuestions.map((q, idx) => ({
      ...q,
      question_html: q.question_html.replace(
        "</p>",
        ` <span style="opacity:0.5">[Set-${i} Q${idx + 1}]</span></p>`
      ),
    }));
    fs.writeFileSync(targetFile, JSON.stringify(tagged, null, 2));
    console.log(`✓ Created data/set-${i}.json`);
  } else {
    console.log(`  Skipped data/set-${i}.json (already exists)`);
  }
}

console.log("\nDone. Replace with your real scraped question files.");

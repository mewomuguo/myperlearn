import fs from "node:fs";
import assert from "node:assert/strict";
const c = JSON.parse(
  fs.readFileSync(
    new URL("../public/data/content.json", import.meta.url),
    "utf8",
  ),
);
assert.equal(c.chapters.length, 12);
assert.equal(c.concepts.length, 150);
assert.equal(c.plans.length, 15);
assert.equal(c.questions.length, 300);
for (const name of ["chapters", "concepts", "questions"])
  assert.equal(new Set(c[name].map((x) => x.id)).size, c[name].length);
for (const x of c.concepts) {
  assert(c.chapters.some((ch) => ch.id === x.chapterId));
  assert(x.lesson.explanation.length > 20);
  assert(x.printedPages.every((p) => p >= 4 && p <= 117));
  for (const id of x.prerequisiteIds)
    assert(c.concepts.some((x) => x.id === id));
  assert.equal(c.questions.filter((q) => q.conceptId === x.id).length, 2);
}
for (const q of c.questions) {
  assert(c.concepts.some((x) => x.id === q.conceptId));
  assert.equal(q.options.length, 4);
  assert.equal(new Set(q.options.map((o) => o.id)).size, 4);
  assert(q.options.some((o) => o.id === q.correctOptionId));
  if (c.concepts.find((x) => x.id === q.conceptId).issue)
    assert.equal(q.status, "quarantined");
}
for (const p of c.plans)
  for (const id of [...p.requiredConceptIds, ...p.optionalConceptIds])
    assert(c.concepts.some((x) => x.id === id));
console.log(
  `Validated ${c.concepts.length} concepts / ${c.questions.length} questions / 15 days / 12 chapters.`,
);

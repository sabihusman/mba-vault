/**
 * calibrate-relevance — the 40-question calibration run for the relevance-gate
 * work order. Report-only: embeds each question, retrieves top-8 against the
 * LOCAL ingestion index, computes the same RelevanceStats the production Ask
 * path now logs, and prints a table + per-category summary. Writes nothing.
 *
 * Both Ask and search_vault call the identical search() over the identical
 * index (see relevance.ts's module comment), so one calibration run — using
 * Ask's k=8 default — covers both paths' score distribution.
 *
 * Every question below is written long-and-natural on purpose: the work order
 * found keyword phrasing scores ~0.10 higher than the same question asked in
 * full, and mixing styles would manufacture false separation between buckets.
 *
 * Usage:
 *   GEMINI_API_KEY=... npm run calibrate:relevance
 *   (optional) INDEX_DIR=/path/to/.index npm run calibrate:relevance
 */
import { join } from "node:path";
import { loadIndex } from "../src/lib/ask/index-store";
import { search } from "../src/lib/ask/search";
import { createGeminiClient } from "../src/lib/ask/gemini";
import { computeRelevanceStats } from "../src/lib/ask/relevance";

const TOP_K = 8; // matches ask/answer.ts's TOP_K

type Category = "covered" | "near-miss" | "off-topic";

interface Question {
  category: Category;
  course: string; // expected course for "covered", or the adjacent subject for near-miss
  text: string;
}

// 20 covered (spanning most of the 17 course folders; Strategy and Product
// Management included per the work order's explicit requirement to cover
// slide-heavy courses, not just textbook-backed ones), 10 near-miss (right
// subject, content believed absent), 10 off-topic (no plausible connection).
const QUESTIONS: Question[] = [
  // --- covered (20) ---
  {
    category: "covered",
    course: "Strategy",
    text:
      "When a company is deciding whether to bring a supplier in-house through vertical " +
      "integration or just work with them through a market contract, what two sequential " +
      "tests should they run to make that decision, and what does each test actually evaluate?",
  },
  {
    category: "covered",
    course: "Strategy",
    text:
      "What's the difference between related and unrelated diversification when a company " +
      "is deciding which businesses to compete in, and why does relatedness matter for " +
      "creating shareholder value?",
  },
  {
    category: "covered",
    course: "Product Management",
    text:
      "What are the different archetypes or personas that product managers can fall into, " +
      "and how do their day-to-day responsibilities and priorities tend to differ from each other?",
  },
  {
    category: "covered",
    course: "Product Management",
    text:
      "When a product team is trying to decide what to build next, what does it actually " +
      "mean for a roadmap to be prioritized by customer value versus by internal stakeholder " +
      "requests, and why does that distinction matter?",
  },
  {
    category: "covered",
    course: "Leadership and Personal Development",
    text:
      "What is the attraction-selection-attrition framework, and how does it explain why the " +
      "people already working at an organization make it so hard for that organization to " +
      "change over time?",
  },
  {
    category: "covered",
    course: "Leadership and Personal Development",
    text:
      "According to Hofstede's research on national culture, what are the value dimensions " +
      "he identified for comparing cultures, and how do high-context and low-context cultures " +
      "differ in how they communicate?",
  },
  {
    category: "covered",
    course: "Leadership and Personal Development",
    text:
      "What does it mean for a leader to practice servant leadership, and how does behaving " +
      "ethically toward followers fit into that leadership style?",
  },
  {
    category: "covered",
    course: "Strategic Mgmt of Tech and Innovation",
    text:
      "How did Intuit build a program that trained ordinary employees to run their own " +
      "customer experiments and become internal champions for design-driven innovation, " +
      "instead of relying on one visionary leader at the top?",
  },
  {
    category: "covered",
    course: "Operations and Supply Chain Management",
    text:
      "In a queueing system like a call center, what do utilization, the coefficient of " +
      "variation of interarrival times, and the coefficient of variation of service times " +
      "each contribute to how long customers end up waiting?",
  },
  {
    category: "covered",
    course: "Marketing",
    text:
      "In organizational change management, why does the basic transition model matter so " +
      "much for understanding whether a reorganization is actually going to work in " +
      "practice, not just on paper?",
  },
  {
    category: "covered",
    course: "Data and Decisions",
    text:
      "When you run a multiple regression that includes a categorical variable like day of " +
      "the week, how do you interpret the coefficients on the dummy variables relative to " +
      "the baseline category?",
  },
  {
    category: "covered",
    course: "Data and Decisions",
    text:
      "How do you decide whether to use a one-sided or a two-sided hypothesis test, and how " +
      "does that choice affect how you form the corresponding confidence interval?",
  },
  {
    category: "covered",
    course: "Data and Decisions",
    text:
      "Walk me through how you'd build a Monte Carlo simulation in Excel to estimate the " +
      "probability that a project ends up profitable, given uncertain input variables.",
  },
  {
    category: "covered",
    course: "Managerial Finance",
    text:
      "How do you read a company's consolidated statement of cash flows to figure out " +
      "whether its operating cash flow is genuinely covering its capital expenditures, using " +
      "a real 10-K like Deere's or PepsiCo's as an example?",
  },
  {
    category: "covered",
    course: "Strategic Brand Positioning",
    text:
      "In the Land Rover case, what made the brand's positioning so effective at turning a " +
      "rugged, expensive vehicle into something customers felt they truly needed rather than " +
      "just wanted?",
  },
  {
    category: "covered",
    course: "Maximizing Team Performance",
    text:
      "What does the research say about what monetary rewards can and cannot actually do to " +
      "motivate employees over the long run?",
  },
  {
    category: "covered",
    course: "Project Management",
    text:
      "Why shouldn't a project lead just assign tasks top-down to team members, and what " +
      "should they do instead to get real buy-in from the team?",
  },
  {
    category: "covered",
    course: "Investments",
    text:
      "What's the difference between calculating a bond's price using its coupon rate versus " +
      "using the market's required yield, and why do bond prices move in the opposite " +
      "direction of interest rates?",
  },
  {
    category: "covered",
    course: "Managerial Economics",
    text:
      "How does a monopolist decide what price and quantity to produce at in order to " +
      "maximize profit, and how is that different from what a perfectly competitive firm " +
      "would do in the same market?",
  },
  {
    category: "covered",
    course: "Product Experimentation",
    text:
      "When you're running an A/B test on a product feature, how do you decide whether " +
      "you've reached statistical significance and it's safe to ship the change, versus when " +
      "you need to keep collecting data?",
  },

  // --- near-miss (10): right subject area, content believed absent ---
  {
    category: "near-miss",
    course: "Investments (quant risk)",
    text:
      "If I wanted to estimate value-at-risk for a fixed income portfolio by simulating " +
      "future interest rate paths with a GARCH model for volatility clustering, how would I " +
      "go about setting that up?",
  },
  {
    category: "near-miss",
    course: "Managerial Economics (market power)",
    text:
      "How is the Lerner Index used to measure how much market power a monopolist actually " +
      "has compared to a perfectly competitive firm?",
  },
  {
    category: "near-miss",
    course: "Managerial Finance (fixed income)",
    text:
      "How do you calculate the Macaulay duration and convexity adjustment for a corporate " +
      "bond portfolio so you can hedge against interest rate risk?",
  },
  {
    category: "near-miss",
    course: "Operations (inventory)",
    text:
      "In the newsvendor model, how do you use the critical fractile formula to decide how " +
      "many units of a perishable product to order before a single selling period?",
  },
  {
    category: "near-miss",
    course: "Marketing (research methods)",
    text:
      "How does conjoint analysis let you estimate how much customers are actually willing " +
      "to pay for different combinations of product attributes?",
  },
  {
    category: "near-miss",
    course: "Strategy (quantitative)",
    text:
      "How would you use real options valuation to decide whether to keep investing in a " +
      "staged R&D project as new information becomes available over time?",
  },
  {
    category: "near-miss",
    course: "Data and Decisions (survival analysis)",
    text:
      "How does the Kaplan-Meier estimator let you analyze customer churn as a time-to-event " +
      "problem when some customers haven't churned yet by the end of your observation window?",
  },
  {
    category: "near-miss",
    course: "Leadership (neuroscience)",
    text:
      "What does the research say about how decision fatigue affects a leader's ethical " +
      "judgment when they've been making high-stakes choices all day under cognitive load?",
  },
  {
    category: "near-miss",
    course: "Product Management (prioritization)",
    text:
      "How do you calculate a Kano model score to sort potential features into must-be, " +
      "performance, and delighter categories when prioritizing a product backlog?",
  },
  {
    category: "near-miss",
    course: "Finance (FX hedging)",
    text:
      "If a company wants to hedge foreign exchange exposure on an international acquisition " +
      "using currency options instead of forward contracts, how should they structure that hedge?",
  },

  // --- off-topic (10): no plausible connection to any course ---
  {
    category: "off-topic",
    course: "n/a",
    text:
      "What's the best way to replace a cracked screen on a mid-range Android phone at home " +
      "without breaking the digitizer underneath?",
  },
  {
    category: "off-topic",
    course: "n/a",
    text:
      "What's the right technique for grouting tile in a small bathroom renovation so the " +
      "lines come out even?",
  },
  {
    category: "off-topic",
    course: "n/a",
    text:
      "How long should you marinate chicken thighs before grilling them to get the best " +
      "flavor without the meat turning mushy?",
  },
  {
    category: "off-topic",
    course: "n/a",
    text:
      "What's the difference between a sourdough starter and a poolish when you're baking " +
      "bread, and when would you use one over the other?",
  },
  {
    category: "off-topic",
    course: "n/a",
    text:
      "How do you train a puppy to stop jumping on guests every time someone comes through " +
      "the front door?",
  },
  {
    category: "off-topic",
    course: "n/a",
    text: "What's the best way to prune a rose bush going into winter so it comes back strong in the spring?",
  },
  {
    category: "off-topic",
    course: "n/a",
    text: "How do migratory birds manage to navigate thousands of miles using the Earth's magnetic field?",
  },
  {
    category: "off-topic",
    course: "n/a",
    text: "What's the correct way to season a cast iron skillet after you've stripped the rust off of it?",
  },
  {
    category: "off-topic",
    course: "n/a",
    text: "How do you fix a toilet that keeps running and refilling the tank after every single flush?",
  },
  {
    category: "off-topic",
    course: "n/a",
    text:
      "What's the recommended tire pressure and rotation schedule for a sedan's all-season " +
      "tires to make them last longer?",
  },
];

interface Row {
  category: Category;
  course: string;
  question: string;
  topScore: number | null;
  spread: number | null;
  topChunkChars: number | null;
  topFile: string;
}

async function main(): Promise<void> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) fail("GEMINI_API_KEY environment variable is required");

  const indexDir = process.env.INDEX_DIR ?? join(__dirname, "..", "..", "ingestion", ".index");
  console.log(`Loading index from ${indexDir} …`);
  const index = await loadIndex(indexDir);
  console.log(
    `Loaded: ${index.manifest.count} chunks, ${Object.keys(index.manifest.files).length} files, ` +
      `model ${index.manifest.model}, built ${index.manifest.createdAt}\n`,
  );

  const gemini = createGeminiClient(apiKey);
  const rows: Row[] = [];

  for (const q of QUESTIONS) {
    const vector = await gemini.embedQuery(q.text);
    const hits = search(index, vector, TOP_K);
    const stats = computeRelevanceStats(hits);
    const top = hits[0];
    rows.push({
      category: q.category,
      course: q.course,
      question: q.text,
      topScore: stats.topScore,
      spread: stats.spread,
      topChunkChars: stats.topChunkChars,
      topFile: top ? `${top.chunk.course} / ${top.chunk.file.split("/").pop()}` : "(no hits)",
    });
    console.log(
      `[${q.category.padEnd(9)}] ${fmt(stats.topScore)}  spread=${fmt(stats.spread)}  ` +
        `chars=${stats.topChunkChars ?? "-"}  ${q.course}\n` +
        `            -> ${rows[rows.length - 1]!.topFile}\n` +
        `            "${q.text.slice(0, 100)}${q.text.length > 100 ? "…" : ""}"`,
    );
  }

  report(rows);
}

function report(rows: Row[]): void {
  console.log("\n=== Per-category score distribution ===");
  for (const category of ["covered", "near-miss", "off-topic"] as const) {
    const scores = rows.filter((r) => r.category === category).map((r) => r.topScore ?? 0);
    const min = Math.min(...scores);
    const max = Math.max(...scores);
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    console.log(
      `  ${category.padEnd(10)} n=${scores.length}  min=${fmt(min)}  max=${fmt(max)}  avg=${fmt(avg)}`,
    );
  }

  const coveredScores = rows.filter((r) => r.category === "covered").map((r) => r.topScore ?? 0);
  const nearMissScores = rows.filter((r) => r.category === "near-miss").map((r) => r.topScore ?? 0);
  const offTopicScores = rows.filter((r) => r.category === "off-topic").map((r) => r.topScore ?? 0);

  const coveredFloor = Math.min(...coveredScores);
  const nearMissCeiling = Math.max(...nearMissScores);
  const offTopicCeiling = Math.max(...offTopicScores);

  console.log("\n=== Separation check ===");
  console.log(`  covered floor:        ${fmt(coveredFloor)}`);
  console.log(`  near-miss ceiling:    ${fmt(nearMissCeiling)}`);
  console.log(`  off-topic ceiling:    ${fmt(offTopicCeiling)}`);
  console.log(`  gap (covered - near-miss): ${fmt(coveredFloor - nearMissCeiling)}`);

  if (coveredFloor <= nearMissCeiling) {
    console.log(
      "\n  *** OVERLAP: at least one covered question scored at or below the near-miss " +
        "ceiling. Per the work order, this means the embedding/chunking is the problem, " +
        "not the threshold — stop and report rather than tuning the number. ***",
    );
  } else {
    console.log(`\n  No overlap: 0.64 threshold sits inside the [${fmt(nearMissCeiling)}, ${fmt(coveredFloor)}] gap.`);
  }

  console.log("\n=== Full table (CSV) ===");
  console.log("category,course,topScore,spread,topChunkChars,topFile,question");
  for (const r of rows) {
    const q = r.question.replaceAll('"', '""');
    console.log(
      `${r.category},"${r.course}",${fmt(r.topScore)},${fmt(r.spread)},${r.topChunkChars ?? ""},"${r.topFile}","${q}"`,
    );
  }
}

function fmt(n: number | null): string {
  return n === null ? "-" : n.toFixed(3);
}

function fail(message: string): never {
  console.error(`calibrate-relevance: ${message}`);
  process.exit(1);
}

main().catch((err: unknown) => fail(err instanceof Error ? err.message : String(err)));

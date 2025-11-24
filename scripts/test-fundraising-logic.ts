import {
    extractFundingAmount,
    extractValuation,
    extractLeadInvestor,
    detectFundingStage,
    findInvestors,
    tagChains
} from '../src/electron/fundraisingConfig';
import * as fs from 'fs';
import * as path from 'path';

const TEST_CASES = [
    {
        text: "Project X raises $10M Seed round led by Paradigm",
        expected: {
            amount: "$10M",
            stage: "Seed",
            lead: "Paradigm",
            investors: ["Paradigm"]
        }
    },
    {
        text: "DeFi Protocol secures $15.5 million in Series A funding at a $100M valuation",
        expected: {
            amount: "$15.5 million",
            stage: "Series A",
            valuation: "$100M",
            lead: undefined
        }
    },
    {
        text: "Gaming studio raises $5M led by a16z and Variant",
        expected: {
            amount: "$5M",
            lead: "a16z",
            investors: ["a16z", "Variant"]
        }
    },
    {
        text: "New L2 raises 100 million dollars in strategic round",
        expected: {
            amount: "100 million",
            stage: "Strategic"
        }
    }
];

const logBuffer: string[] = [];
function log(msg: string) {
    console.log(msg);
    logBuffer.push(msg);
}

log("Running Fundraising Logic Tests...\n");

let passed = 0;
let failed = 0;

TEST_CASES.forEach((test, index) => {
    log(`Test Case #${index + 1}: "${test.text}"`);

    const amount = extractFundingAmount(test.text);
    const stage = detectFundingStage(test.text);
    const valuation = extractValuation(test.text);
    const lead = extractLeadInvestor(test.text);
    const investors = findInvestors(test.text);

    let casePassed = true;

    if (test.expected.amount && amount !== test.expected.amount) {
        log(`  ❌ Amount Mismatch: Expected '${test.expected.amount}', got '${amount}'`);
        casePassed = false;
    }

    if (test.expected.stage && stage !== test.expected.stage) {
        log(`  ❌ Stage Mismatch: Expected '${test.expected.stage}', got '${stage}'`);
        casePassed = false;
    }

    if (test.expected.valuation && valuation !== test.expected.valuation) {
        log(`  ❌ Valuation Mismatch: Expected '${test.expected.valuation}', got '${valuation}'`);
        casePassed = false;
    }

    if (test.expected.lead && lead !== test.expected.lead) {
        log(`  ❌ Lead Investor Mismatch: Expected '${test.expected.lead}', got '${lead}'`);
        casePassed = false;
    }

    if (test.expected.investors) {
        const missing = test.expected.investors.filter(i => !investors.some(found => found.toLowerCase().includes(i.toLowerCase())));
        if (missing.length > 0) {
            log(`  ❌ Missing Investors: ${missing.join(', ')}. Found: ${investors.join(', ')}`);
            casePassed = false;
        }
    }

    if (casePassed) {
        log("  ✅ Passed");
        passed++;
    } else {
        failed++;
    }
    log("---");
});

log(`\nResults: ${passed} Passed, ${failed} Failed`);

fs.writeFileSync(path.join(__dirname, 'test-results-direct.txt'), logBuffer.join('\n'));

if (failed > 0) {
    process.exit(1);
}
